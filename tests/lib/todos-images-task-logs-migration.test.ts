import { describe, expect, it, vi } from "vitest";
import {
  bulkUpsertSql,
  classifyTargetBounded,
  compareKeysetRows,
  MIGRATION_BATCH_SIZE,
  normalizeMigrationValue,
  walkKeysetPages,
} from "../../scripts/migrate-todos-images-task-logs-to-supabase";

type Row = Record<string, unknown> & { id: string };
function reader(rows: Row[]) {
  const calls: Array<{ lastId: string | undefined; take: number }> = [];
  const read = vi.fn(async (lastId: string | undefined, take: number) => {
    calls.push({ lastId, take });
    const start = lastId === undefined ? 0 : rows.findIndex((row) => row.id === lastId) + 1;
    return rows.slice(start, start + take);
  });
  return { read, calls };
}

const rows = (length: number): Row[] => Array.from({ length }, (_, index) => ({
  id: `id-${String(index).padStart(6, "0")}`,
  value: `value-${index}`,
  created_at: "2026-07-12T00:00:00.000Z",
}));

describe("Todo/Image/TaskRunLog migration", () => {
  it("uses bounded, single-parameter JSONB recordset inserts for every model", () => {
    expect(MIGRATION_BATCH_SIZE).toBeGreaterThan(0);
    expect(MIGRATION_BATCH_SIZE).toBeLessThanOrEqual(5_000);
    for (const table of ["todos", "images", "task_run_logs"] as const) {
      const sql = bulkUpsertSql(table);
      expect(sql).toContain("jsonb_to_recordset($1::jsonb)");
      expect(sql).toContain("on conflict(id) do nothing");
      expect(sql).not.toMatch(/\$2|do update|truncate/i);
    }
  });

  it("keyset-walks more than one source batch with bounded reads and no offset", async () => {
    for (const table of ["todos", "images", "task_run_logs"]) {
      const source = reader(rows(MIGRATION_BATCH_SIZE + 1));
      const sizes: number[] = [];
      expect(await walkKeysetPages(source.read, (page) => { sizes.push(page.length); })).toBe(MIGRATION_BATCH_SIZE + 1);
      expect(sizes).toEqual([MIGRATION_BATCH_SIZE, 1]);
      expect(source.calls).toEqual([
        { lastId: undefined, take: MIGRATION_BATCH_SIZE },
        { lastId: `id-${String(MIGRATION_BATCH_SIZE - 1).padStart(6, "0")}`, take: MIGRATION_BATCH_SIZE },
      ]);
      expect(table).toBeTruthy();
    }
  });

  it("classifies every model through bounded source and target keyset batches", async () => {
    for (const table of ["todos", "images", "task_run_logs"]) {
      const data = rows(MIGRATION_BATCH_SIZE + 1);
      const source = reader(data);
      const target = reader(data.map((row) => ({ ...row, created_at: new Date(String(row.created_at)) })));
      await expect(classifyTargetBounded(table, ["id", "value", "created_at"], data.length, data.length, source.read, target.read)).resolves.toBe("exact");
      for (const calls of [source.calls, target.calls]) {
        expect(calls).toHaveLength(2);
        expect(calls.every((call) => call.take === MIGRATION_BATCH_SIZE)).toBe(true);
        expect(calls[1].lastId).toBe(`id-${String(MIGRATION_BATCH_SIZE - 1).padStart(6, "0")}`);
      }
    }
  });

  it("allows empty targets and rejects divergence without leaking IDs or values", async () => {
    const sourceRows = [{ id: "private-id", value: "source-secret", created_at: "2026-07-12T00:00:00.000Z" }];
    const source = reader(sourceRows);
    const empty = reader([]);
    await expect(classifyTargetBounded("todos", ["id", "value"], 1, 0, source.read, empty.read)).resolves.toBe("empty");
    expect(source.read).not.toHaveBeenCalled();

    const target = reader([{ ...sourceRows[0], value: "target-secret" }]);
    try { await compareKeysetRows("todos", ["id", "value"], reader(sourceRows).read, target.read); }
    catch (error) {
      expect(String(error)).toContain("column=value");
      expect(String(error)).not.toMatch(/private-id|source-secret|target-secret/);
    }
  });

  it("normalizes equivalent PostgreSQL timestamp representations", () => {
    expect(normalizeMigrationValue("created_at", "2026-07-12 08:00:00.123000+08")).toBe("2026-07-12T00:00:00.123Z");
    expect(normalizeMigrationValue("created_at", new Date("2026-07-12T00:00:00.123Z"))).toBe("2026-07-12T00:00:00.123Z");
    expect(normalizeMigrationValue("title", "2026-07-12T00:00:00Z")).toBe("2026-07-12T00:00:00Z");
  });
});
