import * as dns from "node:dns";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import * as net from "node:net";
import { resolve } from "node:path";
import { loadProjectEnv } from "../lib/load-env";

loadProjectEnv();
import { Client } from "pg";


const databaseUrl = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.DATABASE_DIRECT_URL;
const schemaPath = resolve(process.cwd(), "docs/supabase-notice-manager.sql");
const caPath = resolve(process.cwd(), "scripts/certs/supabase-root-2021-ca.crt");

// Supabase direct DB endpoints can be IPv6-only. This operational script must
// use the IPv4-capable Session Pooler configured in SUPABASE_DB_URL.
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily(false);

if (!databaseUrl) {
  console.error("Missing SUPABASE_DB_URL / POSTGRES_URL / DATABASE_DIRECT_URL. Refuse to guess the target database.");
  process.exit(2);
}

if (!existsSync(schemaPath)) {
  console.error(`Schema file not found: ${schemaPath}`);
  process.exit(2);
}

async function main() {
  const sql = await readFile(schemaPath, "utf8");
  const url = new URL(databaseUrl!);
  if (!url.hostname.endsWith(".pooler.supabase.com")) {
    throw new Error("SUPABASE_DB_URL 必须使用 Supabase IPv4 Session Pooler 连接串，不能使用 db.<project-ref>.supabase.co 直连地址。");
  }
  // Let the explicit ssl option below control certificate handling.
  url.searchParams.delete("sslmode");

  const ca = await readFile(caPath, "utf8");
  const client = new Client({
    connectionString: url.toString(),
    ssl: { ca, rejectUnauthorized: true },
    connectionTimeoutMillis: 10_000,
  });

  try {
    await client.connect();
    await client.query(sql);
    console.log("Supabase NoticeManager schema applied successfully through the IPv4 Session Pooler.");
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Failed to apply Supabase NoticeManager schema.");
  process.exit(1);
});
