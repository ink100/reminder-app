import * as dns from "node:dns";
import * as net from "node:net";
import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { loadProjectEnv } from "../lib/load-env";

loadProjectEnv();
import type { AppSetting, Prisma } from "@prisma/client";
import { Client } from "pg";
import { APP_SETTINGS_MIGRATION_VERSION } from "../lib/app-settings/migration-version";
import { prisma } from "../lib/prisma";

dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily(false);
const execFile = promisify(execFileCallback);
const dbUrl = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.DATABASE_DIRECT_URL;
export const columns = ["id","app_name","timezone","default_remind_before_days","default_remind_before_hours","overdue_repeat_enabled","daily_remind_time","email_notifications_enabled","notification_email","smtp_host","smtp_port","smtp_user","smtp_pass_encrypted","smtp_from_email","smtp_from_name","otp_secret_encrypted","otp_configured_at","reminder_email_enabled","reminder_email_interval","notify_start_hour","notify_end_hour","r2_endpoint","r2_access_key","r2_secret_key","r2_bucket","r2_public_url","r2_cache_control","telegram_bot_enabled","telegram_bot_token_encrypted","telegram_bot_chat_id","telegram_bot_name","telegram_bot_username","telegram_bot_last_test_at","telegram_bot_last_test_status","created_at","updated_at"] as const;
type Comparable = Record<string, unknown>;

function normalize(value: unknown): unknown { if (value instanceof Date) return value.toISOString(); if (value == null) return null; if (typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value)) { const date=new Date(value); if (!Number.isNaN(date.valueOf())) return date.toISOString(); } return value; }
export function sourceRow(x: AppSetting): Comparable { return Object.fromEntries(columns.map((column) => [column, x[column.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase()) as keyof AppSetting]])); }
export function verifyAppSettings(source: Comparable[], target: Comparable[]): number {
  const a=new Map(source.map(row=>[String(row.id),row])); const b=new Map(target.map(row=>[String(row.id),row]));
  const sourceOnly=[...a.keys()].filter(id=>!b.has(id)); const targetOnly=[...b.keys()].filter(id=>!a.has(id));
  if(sourceOnly.length||targetOnly.length) throw new Error(`Verification failed for app_settings: source-only=${sourceOnly.length}, target-only=${targetOnly.length}`);
  for(const [id, expected] of a) for(const column of columns) if(normalize(expected[column])!==normalize(b.get(id)?.[column])) throw new Error(`Verification failed for app_settings: mismatch at id=${id}, column=${column}`);
  return target.length;
}

export async function assertFrozenSource(env: Readonly<Record<string, string | undefined>> = process.env, serviceState?:()=>Promise<string>) {
  if (env.REMINDER_APP_SOURCE_FROZEN === "confirmed") return;
  try {
    const state = serviceState ? await serviceState() : (await execFile("systemctl", ["show","reminder-app.service","--property=ActiveState","--value"])).stdout.trim();
    if (state !== "inactive" && state !== "failed") throw new Error(`reminder-app.service must be inactive (state=${state})`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("must be inactive")) throw error;
    throw new Error("Cannot prove reminder-app.service is inactive; stop it or set REMINDER_APP_SOURCE_FROZEN=confirmed only when SQLite is externally write-frozen");
  }
}

async function verifyCatalog(pg: Client) {
  const state=(await pg.query(`select bool_and(c.relrowsecurity) as rls,bool_and(c.relforcerowsecurity) as force_rls,
    (select count(*)::int from pg_policies where schemaname='public' and tablename in ('app_settings','app_migrations')) as policies,
    (select coalesce(array_agg(coalesce(r.rolname,'PUBLIC')||':'||c.relname||':'||x.privilege_type order by r.rolname,c.relname,x.privilege_type),array[]::text[])
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r',c.relowner))) x left join pg_roles r on r.oid=x.grantee
      where n.nspname='public' and c.relname in ('app_settings','app_migrations') and x.grantee<>c.relowner) as grants,
    (select array_agg(column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') order by ordinal_position)
      from information_schema.columns where table_schema='public' and table_name='app_migrations') as migration_columns,
    (select coalesce(array_agg(pg_get_constraintdef(k.oid) order by k.oid),array[]::text[])
      from pg_constraint k join pg_class t on t.oid=k.conrelid join pg_namespace ns on ns.oid=t.relnamespace
      where ns.nspname='public' and t.relname='app_migrations' and k.contype='p') as migration_pks
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('app_settings','app_migrations')`)).rows[0];
  const expected=["service_role:app_migrations:SELECT","service_role:app_settings:DELETE","service_role:app_settings:INSERT","service_role:app_settings:SELECT","service_role:app_settings:UPDATE"];
  if (!state?.rls || !state.force_rls || Number(state.policies)!==0 || JSON.stringify(state.grants)!==JSON.stringify(expected) ||
      JSON.stringify(state.migration_columns)!==JSON.stringify(["version:text:NO:","completed_at:timestamp with time zone:NO:now()"]) ||
      JSON.stringify(state.migration_pks)!==JSON.stringify(["PRIMARY KEY (version)"]))
    throw new Error("Final catalog schema/security verification failed");
}

async function migrateSnapshot(source: Comparable[]) {
  if (!dbUrl) throw new Error("Missing Supabase database URL");
  const url=new URL(dbUrl); if(!url.hostname.endsWith(".pooler.supabase.com")) throw new Error("Supabase database URL must use the IPv4 Session Pooler hostname suffix .pooler.supabase.com"); url.searchParams.delete("sslmode");
  const ca=await readFile(resolve("scripts/certs/supabase-root-2021-ca.crt"),"utf8");
  const pg=new Client({connectionString:url.toString(),ssl:{ca,rejectUnauthorized:true},connectionTimeoutMillis:10_000});
  try {
    await pg.connect(); const socket=pg.connection.stream as net.Socket; if(!socket.remoteAddress||net.isIP(socket.remoteAddress)!==4) throw new Error("Supabase connection did not use an authorized IPv4 socket");
    await pg.query("begin"); await pg.query(await readFile(resolve("docs/supabase-app-settings.sql"),"utf8"));
    const existing=(await pg.query(`select ${columns.join(",")} from public.app_settings order by id`)).rows;
    if(existing.length) verifyAppSettings(source,existing); else if(source.length) await pg.query(`insert into public.app_settings(${columns.join(",")}) values(${columns.map((_,i)=>`$${i+1}`).join(",")})`,columns.map(c=>source[0][c]));
    const target=(await pg.query(`select ${columns.join(",")} from public.app_settings order by id`)).rows; const count=verifyAppSettings(source,target);
    await verifyCatalog(pg);
    await pg.query("insert into public.app_migrations(version) values($1) on conflict (version) do update set completed_at=excluded.completed_at",[APP_SETTINGS_MIGRATION_VERSION]);
    await pg.query("commit"); console.log(`Migration verified (appSettings=${count}). SQLite was not modified.`);
  } catch(error) { await pg.query("rollback").catch(()=>{}); throw error; } finally { await pg.end().catch(()=>{}); }
}

async function main() {
  await assertFrozenSource();
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const source=(await tx.appSetting.findMany({orderBy:{id:"asc"}})).map(sourceRow);
    if(source.some(row=>row.id!==1)||source.length>1) throw new Error("SQLite AppSetting violates singleton id=1");
    await migrateSnapshot(source);
    const unchanged=(await tx.appSetting.findMany({orderBy:{id:"asc"}})).map(sourceRow); verifyAppSettings(source,unchanged);
  }, { timeout: 300_000, maxWait: 10_000 });
  await prisma.$disconnect();
}
if(import.meta.url===pathToFileURL(process.argv[1]??"").href) main().catch(async error=>{ await prisma.$disconnect().catch(()=>{}); console.error(error instanceof Error?error.message:"Migration failed"); process.exit(1); });
