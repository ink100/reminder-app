import * as dns from "node:dns";
import * as net from "node:net";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnvConfig } from "@next/env";
import { Client } from "pg";
import { prisma } from "../lib/prisma";
loadEnvConfig(process.cwd()); dns.setDefaultResultOrder("ipv4first"); net.setDefaultAutoSelectFamily(false);
const dbUrl=process.env.SUPABASE_DB_URL||process.env.POSTGRES_URL||process.env.DATABASE_DIRECT_URL;
const iso=(v:Date|null)=>v?.toISOString()??null;
type Comparable = Record<string, unknown>;
function normalized(value: unknown): unknown {
 if(value instanceof Date) return value.toISOString();
 if(value === null || value === undefined) return value ?? null;
 // pg returns timestamptz as Date, but test doubles and other drivers may return strings.
 if(typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value)){const date=new Date(value);if(!Number.isNaN(date.valueOf())) return date.toISOString();}
 return value;
}
/** Exact, value-safe verification. Errors identify only table/column/id, never row values. */
export function verifyTableRows(table:string, columns:string[], source:Comparable[], target:Comparable[]):number {
 const sourceById=new Map(source.map(row=>[String(row.id),row])); const targetById=new Map(target.map(row=>[String(row.id),row]));
 const sourceOnly=[...sourceById.keys()].filter(id=>!targetById.has(id)); const targetOnly=[...targetById.keys()].filter(id=>!sourceById.has(id));
 if(sourceOnly.length||targetOnly.length) throw new Error(`Verification failed for ${table}: source-only=${sourceOnly.length}, target-only=${targetOnly.length}`);
 for(const [id,expected] of sourceById){const actual=targetById.get(id)!;for(const column of columns){if(normalized(expected[column])!==normalized(actual[column])) throw new Error(`Verification failed for ${table}: mismatch at id=${id}, column=${column}`);}}
 return target.length;
}
const POST_IMPORT_MARKER = "-- POST-IMPORT: ownership repair, verification, constraints, triggers, and RPCs.";
export function splitSupabaseMigrationSql(sql:string) {
 const markerIndex=sql.indexOf(POST_IMPORT_MARKER);
 if(markerIndex<0) throw new Error("Supabase migration is missing the post-import marker");
 return {preImportSql:sql.slice(0,markerIndex),postImportSql:sql.slice(markerIndex+POST_IMPORT_MARKER.length)};
}
async function main(){
 if(!dbUrl) throw new Error("Missing Supabase database URL"); const url=new URL(dbUrl); if(!url.hostname.endsWith(".pooler.supabase.com")) throw new Error("Supabase database URL must use the IPv4 Session Pooler"); url.searchParams.delete("sslmode");
 const ca=await readFile(resolve("scripts/certs/supabase-root-2021-ca.crt"),"utf8");
 const pg=new Client({connectionString:url.toString(),ssl:{ca,rejectUnauthorized:true},connectionTimeoutMillis:10000});
 const [reminders,attachments,accounts]=await Promise.all([prisma.reminder.findMany(),prisma.attachment.findMany(),prisma.licenseStoreAccount.findMany()]);
 const migrationSql=splitSupabaseMigrationSql(await readFile(resolve("docs/supabase-reminders.sql"),"utf8"));
 try { await pg.connect(); await pg.query("begin"); await pg.query(migrationSql.preImportSql);
  for(const x of reminders) await pg.query(`insert into public.reminders(id,title,description,activation_code,activation_contact,due_at,priority,category,remind_before_days,remind_before_hours,overdue_remind_enabled,recurrence_type,recurrence_interval,upcoming_notified_at,overdue_notified_at,completed_at,created_at,updated_at,deleted_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) on conflict(id) do update set title=excluded.title,description=excluded.description,activation_code=excluded.activation_code,activation_contact=excluded.activation_contact,due_at=excluded.due_at,priority=excluded.priority,category=excluded.category,remind_before_days=excluded.remind_before_days,remind_before_hours=excluded.remind_before_hours,overdue_remind_enabled=excluded.overdue_remind_enabled,recurrence_type=excluded.recurrence_type,recurrence_interval=excluded.recurrence_interval,upcoming_notified_at=excluded.upcoming_notified_at,overdue_notified_at=excluded.overdue_notified_at,completed_at=excluded.completed_at,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at`,[x.id,x.title,x.description,x.activationCode,x.activationContact,iso(x.dueAt),x.priority,x.category,x.remindBeforeDays,x.remindBeforeHours,x.overdueRemindEnabled,x.recurrenceType,x.recurrenceInterval,iso(x.upcomingNotifiedAt),iso(x.overdueNotifiedAt),iso(x.completedAt),iso(x.createdAt),iso(x.updatedAt),iso(x.deletedAt)]);
  for(const x of accounts) await pg.query(`insert into public.license_store_accounts(id,shop_name,phone,remote_code,remote_password,is_other_account,expires_at,activation_code,reminder_id,created_at,updated_at,deleted_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict(id) do update set shop_name=excluded.shop_name,phone=excluded.phone,remote_code=excluded.remote_code,remote_password=excluded.remote_password,is_other_account=excluded.is_other_account,expires_at=coalesce(excluded.expires_at,public.license_store_accounts.expires_at),activation_code=excluded.activation_code,reminder_id=coalesce(excluded.reminder_id,public.license_store_accounts.reminder_id),created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at`,[x.id,x.shopName,x.phone,x.remoteCode,x.remotePassword,x.isOtherAccount,iso(x.expiresAt),x.activationCode,x.reminderId,iso(x.createdAt),iso(x.updatedAt),iso(x.deletedAt)]);
  for(const x of attachments) await pg.query(`insert into public.attachments(id,filename,original_name,mimetype,size,r2_key,url,reminder_id,attachment_type,medicine_id,license_store_account_id,created_at,deleted_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) on conflict(id) do update set filename=excluded.filename,original_name=excluded.original_name,mimetype=excluded.mimetype,size=excluded.size,r2_key=excluded.r2_key,url=excluded.url,reminder_id=excluded.reminder_id,attachment_type=excluded.attachment_type,medicine_id=excluded.medicine_id,license_store_account_id=excluded.license_store_account_id,created_at=excluded.created_at,deleted_at=excluded.deleted_at`,[x.id,x.filename,x.originalName,x.mimetype,x.size,x.r2Key,x.url,x.reminderId,x.attachmentType,x.medicineId,x.licenseStoreAccountId,iso(x.createdAt),iso(x.deletedAt)]);
  const specs=[
   {table:"reminders",columns:["id","title","description","activation_code","activation_contact","due_at","priority","category","remind_before_days","remind_before_hours","overdue_remind_enabled","recurrence_type","recurrence_interval","upcoming_notified_at","overdue_notified_at","completed_at","created_at","updated_at","deleted_at"],source:reminders.map(x=>({id:x.id,title:x.title,description:x.description,activation_code:x.activationCode,activation_contact:x.activationContact,due_at:x.dueAt,priority:x.priority,category:x.category,remind_before_days:x.remindBeforeDays,remind_before_hours:x.remindBeforeHours,overdue_remind_enabled:x.overdueRemindEnabled,recurrence_type:x.recurrenceType,recurrence_interval:x.recurrenceInterval,upcoming_notified_at:x.upcomingNotifiedAt,overdue_notified_at:x.overdueNotifiedAt,completed_at:x.completedAt,created_at:x.createdAt,updated_at:x.updatedAt,deleted_at:x.deletedAt}))},
   {table:"attachments",columns:["id","filename","original_name","mimetype","size","r2_key","url","reminder_id","attachment_type","medicine_id","license_store_account_id","created_at","deleted_at"],source:attachments.map(x=>({id:x.id,filename:x.filename,original_name:x.originalName,mimetype:x.mimetype,size:x.size,r2_key:x.r2Key,url:x.url,reminder_id:x.reminderId,attachment_type:x.attachmentType,medicine_id:x.medicineId,license_store_account_id:x.licenseStoreAccountId,created_at:x.createdAt,deleted_at:x.deletedAt}))},
   {table:"license_store_accounts",columns:["id","shop_name","phone","remote_code","remote_password","is_other_account","activation_code","created_at","updated_at","deleted_at"],source:accounts.map(x=>({id:x.id,shop_name:x.shopName,phone:x.phone,remote_code:x.remoteCode,remote_password:x.remotePassword,is_other_account:x.isOtherAccount,activation_code:x.activationCode,created_at:x.createdAt,updated_at:x.updatedAt,deleted_at:x.deletedAt}))},
  ];
  const checks=[];for(const spec of specs){const ids=spec.source.map(row=>String(row.id));const result=await pg.query(`select ${spec.columns.join(",")} from public.${spec.table} where id = any($1::text[])`,[ids]);checks.push(verifyTableRows(spec.table,spec.columns,spec.source,result.rows));}
  await pg.query(migrationSql.postImportSql);
  await pg.query("commit"); console.log(`Migration imported and post-sync verified (reminders=${checks[0]}, attachments=${checks[1]}, licenseStoreAccounts=${checks[2]}). SQLite was not modified.`);
 } catch(e){await pg.query("rollback").catch(()=>{});throw e} finally {await pg.end().catch(()=>{});await prisma.$disconnect();}
}
if(import.meta.url===pathToFileURL(process.argv[1]??"").href) main().catch(e=>{console.error(e instanceof Error?e.message:"Migration failed");process.exit(1)});
