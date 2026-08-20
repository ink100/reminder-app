import * as dns from "node:dns";
import { readFile } from "node:fs/promises";
import * as net from "node:net";
import { resolve } from "node:path";
import { Client } from "pg";

import { loadProjectEnv } from "../lib/load-env";

loadProjectEnv();
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily(false);

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.DATABASE_DIRECT_URL;
const schemaPath = resolve(process.cwd(), "docs/supabase-voice-assistant-settings.sql");
const caPath = resolve(process.cwd(), "scripts/certs/supabase-root-2021-ca.crt");

async function main() {
  if (!databaseUrl) throw new Error("缺少 SUPABASE_DB_URL / POSTGRES_URL / DATABASE_DIRECT_URL，拒绝猜测数据库目标。");
  const url = new URL(databaseUrl);
  if (!url.hostname.endsWith(".pooler.supabase.com")) {
    throw new Error("SUPABASE_DB_URL 必须使用 Supabase IPv4 Session Pooler 连接串。");
  }
  url.searchParams.delete("sslmode");
  const [sql, ca] = await Promise.all([readFile(schemaPath, "utf8"), readFile(caPath, "utf8")]);
  const client = new Client({
    connectionString: url.toString(),
    ssl: { ca, rejectUnauthorized: true },
    connectionTimeoutMillis: 10_000,
  });
  try {
    await client.connect();
    const socket = client.connection.stream as { authorized?: boolean; remoteFamily?: string };
    if (socket.authorized !== true || socket.remoteFamily !== "IPv4") throw new Error("数据库连接未通过授权 IPv4 TLS 校验");
    await client.query(sql);
    const result = await client.query<{ count: string }>("select count(*)::text as count from information_schema.columns where table_schema='public' and table_name='app_settings' and column_name like 'voice_assistant_%'");
    if (result.rows[0]?.count !== "8") throw new Error("AI 语音助手数据库字段验证失败");
    const marker = await client.query<{ version: string }>("select version from public.app_migrations where version = 'app-settings-voice-assistant-v1'");
    if (marker.rows[0]?.version !== "app-settings-voice-assistant-v1") throw new Error("AI 语音助手数据库迁移标记验证失败");
    console.log("AI voice assistant settings schema and migration marker applied and verified (8 columns).");
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Failed to apply AI voice assistant settings schema.");
  process.exit(1);
});
