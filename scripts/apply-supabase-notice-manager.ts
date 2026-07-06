import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.DATABASE_DIRECT_URL;
const schemaPath = resolve(process.cwd(), "docs/supabase-notice-manager.sql");

if (!databaseUrl) {
  console.error("Missing SUPABASE_DB_URL / POSTGRES_URL / DATABASE_DIRECT_URL. Refuse to guess the target database.");
  process.exit(2);
}

if (!existsSync(schemaPath)) {
  console.error(`Schema file not found: ${schemaPath}`);
  process.exit(2);
}

const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", schemaPath], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
