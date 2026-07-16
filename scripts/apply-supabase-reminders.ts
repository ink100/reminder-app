import * as dns from "node:dns";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import * as net from "node:net";
import { resolve } from "node:path";

import { loadEnvConfig } from "@next/env";
import { Client } from "pg";

loadEnvConfig(process.cwd());

dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily(false);

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.DATABASE_DIRECT_URL;
const schemaPath = resolve(process.cwd(), "docs/supabase-reminders.sql");
const caPath = resolve(process.cwd(), "scripts/certs/supabase-root-2021-ca.crt");

if (!databaseUrl) {
  console.error("Missing SUPABASE_DB_URL / POSTGRES_URL / DATABASE_DIRECT_URL. Refuse to guess the target database.");
  process.exit(2);
}
if (!existsSync(schemaPath) || !existsSync(caPath)) {
  console.error("Reminder schema or Supabase CA file is missing.");
  process.exit(2);
}

async function main() {
  const url = new URL(databaseUrl!);
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
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log("Supabase reminder schema applied successfully.");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Failed to apply Supabase reminder schema.");
  process.exit(1);
});
