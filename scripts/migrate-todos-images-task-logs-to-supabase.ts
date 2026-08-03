import * as dns from "node:dns";
import * as net from "node:net";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { loadProjectEnv } from "../lib/load-env";

loadProjectEnv();
import { Client, type PoolClient } from "pg";
import { prisma } from "../lib/prisma";

dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily(false);

const dbUrl = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.DATABASE_DIRECT_URL;
export const MIGRATION_BATCH_SIZE = 2_000;
export const TASK_LOG_BATCH_SIZE = MIGRATION_BATCH_SIZE;
type Row = Record<string, unknown> & { id: string };
type Table = keyof typeof specs;
type PageReader = (lastId: string | undefined, take: number) => Promise<Row[]>;
type SourceRaw = { id: string; [key: string]: unknown };
type SourceDelegate = {
  findMany(args: { orderBy: { id: "asc" }; take: number; where?: { id: { gt: string } } }): Promise<SourceRaw[]>;
  count(): Promise<number>;
};
type SnapshotTx = { todo: SourceDelegate; image: SourceDelegate; taskRunLog: SourceDelegate };
const iso = (value: Date | null) => value?.toISOString() ?? null;
const runFile = promisify(execFile);
const timestampColumns = new Set(["completed_at", "created_at", "updated_at", "deleted_at", "started_at", "finished_at"]);

export function normalizeMigrationValue(column: string, value: unknown): unknown {
  if (value === null || !timestampColumns.has(column)) return value;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.valueOf()) ? value : date.toISOString();
}

/** Iterates a stable id-ordered snapshot without offset and retains at most one page. */
export async function walkKeysetPages(read: PageReader, visit: (rows: Row[]) => Promise<void> | void, take = MIGRATION_BATCH_SIZE): Promise<number> {
  let lastId: string | undefined;
  let total = 0;
  for (;;) {
    const rows = await read(lastId, take);
    if (rows.length > take) throw new Error("Keyset reader exceeded its bounded page size");
    if (!rows.length) return total;
    for (let index = 0; index < rows.length; index++) {
      if ((lastId !== undefined && rows[index].id <= lastId) || (index > 0 && rows[index].id <= rows[index - 1].id))
        throw new Error("Keyset reader returned rows outside strict id order");
    }
    await visit(rows);
    total += rows.length;
    lastId = rows[rows.length - 1].id;
    if (rows.length < take) return total;
  }
}

function assertRowsEqual(table: string, columns: readonly string[], source: Row, target: Row) {
  for (const column of columns) {
    if (!Object.is(normalizeMigrationValue(column, source[column]), normalizeMigrationValue(column, target[column])))
      throw new Error(`Verification failed for ${table}: column=${column}`);
  }
}

/** Bounded merge comparison. Equal counts mean matching page boundaries for the same page size. */
export async function compareKeysetRows(table: string, columns: readonly string[], sourceRead: PageReader, targetRead: PageReader): Promise<number> {
  let sourceLast: string | undefined;
  let targetLast: string | undefined;
  let total = 0;
  for (;;) {
    const [source, target] = await Promise.all([
      sourceRead(sourceLast, MIGRATION_BATCH_SIZE), targetRead(targetLast, MIGRATION_BATCH_SIZE),
    ]);
    if (source.length > MIGRATION_BATCH_SIZE || target.length > MIGRATION_BATCH_SIZE) throw new Error(`Verification failed for ${table}: unbounded page`);
    if (source.length !== target.length) throw new Error(`Verification failed for ${table}: row count changed`);
    if (!source.length) return total;
    for (let index = 0; index < source.length; index++) {
      if (source[index].id !== target[index].id) throw new Error(`Verification failed for ${table}: id set differs`);
      assertRowsEqual(table, columns, source[index], target[index]);
    }
    sourceLast = source[source.length - 1].id;
    targetLast = target[target.length - 1].id;
    total += source.length;
    if (source.length < MIGRATION_BATCH_SIZE) return total;
  }
}

export type TargetState = "empty" | "exact";
export async function classifyTargetBounded(table: string, columns: readonly string[], sourceCount: number, targetCount: number, sourceRead: PageReader, targetRead: PageReader): Promise<TargetState> {
  if (targetCount === 0) return "empty";
  if (sourceCount !== targetCount) throw new Error(`Verification failed for ${table}: row counts differ`);
  await compareKeysetRows(table, columns, sourceRead, targetRead);
  return "exact";
}

const specs = {
  todos: { columns: ["id", "title", "completed_at", "created_at", "updated_at", "deleted_at"], types: "id text,title text,completed_at timestamptz,created_at timestamptz,updated_at timestamptz,deleted_at timestamptz" },
  images: { columns: ["id", "filename", "original_name", "mimetype", "size", "r2_key", "url", "created_at", "deleted_at"], types: "id text,filename text,original_name text,mimetype text,size integer,r2_key text,url text,created_at timestamptz,deleted_at timestamptz" },
  task_run_logs: { columns: ["id", "task", "started_at", "finished_at", "success", "summary", "created_at"], types: "id text,task text,started_at timestamptz,finished_at timestamptz,success boolean,summary text,created_at timestamptz" },
} as const;

export function bulkUpsertSql(table: Table): string {
  const { columns, types } = specs[table];
  return `insert into public.${table}(${columns.join(",")}) select ${columns.join(",")} from jsonb_to_recordset($1::jsonb) as x(${types}) on conflict(id) do nothing`;
}

async function assertFrozenSource() {
  if (process.env.REMINDER_APP_SOURCE_FROZEN === "confirmed") return;
  try {
    const { stdout } = await runFile("systemctl", ["show", "reminder-app.service", "--property=ActiveState", "--value"]);
    const state = stdout.trim();
    if (state === "inactive" || state === "failed") return;
    throw new Error(`reminder-app.service must be inactive (state=${state || "unknown"})`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("must be inactive")) throw error;
    throw new Error("Cannot prove reminder-app.service is inactive; stop it or set REMINDER_APP_SOURCE_FROZEN=confirmed only when the SQLite source is externally frozen");
  }
}

function sourceReader(tx: SnapshotTx, table: Table): PageReader {
  const delegate = table === "todos" ? tx.todo : table === "images" ? tx.image : tx.taskRunLog;
  return async (lastId, take) => {
    const rows = await delegate.findMany({ orderBy: { id: "asc" }, take, ...(lastId === undefined ? {} : { where: { id: { gt: lastId } } }) });
    if (table === "todos") return rows.map((x) => ({ id:x.id,title:x.title,completed_at:iso(x.completedAt as Date | null),created_at:iso(x.createdAt as Date),updated_at:iso(x.updatedAt as Date),deleted_at:iso(x.deletedAt as Date | null) }));
    if (table === "images") return rows.map((x) => ({ id:x.id,filename:x.filename,original_name:x.originalName,mimetype:x.mimetype,size:x.size,r2_key:x.r2Key,url:x.url,created_at:iso(x.createdAt as Date),deleted_at:iso(x.deletedAt as Date | null) }));
    return rows.map((x) => ({ id:x.id,task:x.task,started_at:iso(x.startedAt as Date),finished_at:iso(x.finishedAt as Date | null),success:x.success,summary:x.summary,created_at:iso(x.createdAt as Date) }));
  };
}

function targetReader(pg: Client | PoolClient, table: Table): PageReader {
  const columns = specs[table].columns.join(",");
  return async (lastId, take) => (await pg.query(
    `select ${columns} from public.${table}${lastId === undefined ? "" : " where id > $1"} order by id asc limit ${take}`,
    lastId === undefined ? [] : [lastId],
  )).rows;
}

async function targetCount(pg: Client | PoolClient, table: Table): Promise<number> {
  return Number((await pg.query(`select count(*)::text as count from public.${table}`)).rows[0].count);
}

async function runInSnapshot(tx: SnapshotTx, pg: Client | PoolClient) {
  const tables = Object.keys(specs) as Table[];
  const states = {} as Record<Table, TargetState>;
  const counts = {} as Record<Table, number>;
  // All three classifications complete before the first insert.
  for (const table of tables) {
    const delegate = table === "todos" ? tx.todo : table === "images" ? tx.image : tx.taskRunLog;
    counts[table] = await delegate.count();
    states[table] = await classifyTargetBounded(table, specs[table].columns, counts[table], await targetCount(pg, table), sourceReader(tx, table), targetReader(pg, table));
  }
  for (const table of tables) if (states[table] === "empty") {
    await walkKeysetPages(sourceReader(tx, table), async (rows) => {
      const result = await pg.query(bulkUpsertSql(table), [JSON.stringify(rows)]);
      if (result.rowCount !== rows.length) throw new Error(`Migration failed for ${table}: target changed during load`);
    });
  }
  for (const table of tables) {
    if (counts[table] !== await targetCount(pg, table)) throw new Error(`Verification failed for ${table}: row counts differ`);
    await compareKeysetRows(table, specs[table].columns, sourceReader(tx, table), targetReader(pg, table));
  }
  return counts;
}

async function main() {
  if (!dbUrl) throw new Error("Missing Supabase database URL");
  await assertFrozenSource();
  const url = new URL(dbUrl);
  if (!url.hostname.endsWith(".pooler.supabase.com")) throw new Error("Supabase database URL must use the IPv4 Session Pooler");
  url.searchParams.delete("sslmode");
  const ca = await readFile(resolve("scripts/certs/supabase-root-2021-ca.crt"), "utf8");
  const pg = new Client({ connectionString: url.toString(), ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 10_000 });
  try {
    await pg.connect(); await pg.query("begin");
    await pg.query(await readFile(resolve("docs/supabase-todos-images-task-run-logs.sql"), "utf8"));
    const counts = await prisma.$transaction((tx) => runInSnapshot(tx as unknown as SnapshotTx, pg), { maxWait: 10_000, timeout: 300_000 });
    await pg.query("commit");
    console.log(`Migration verified (todos=${counts.todos}, images=${counts.images}, taskRunLogs=${counts.task_run_logs}). SQLite was not modified.`);
  } catch (error) { await pg.query("rollback").catch(() => {}); throw error; }
  finally { await pg.end().catch(() => {}); await prisma.$disconnect(); }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main().catch((error) => { console.error(error instanceof Error ? error.message : "Migration failed"); process.exit(1); });
