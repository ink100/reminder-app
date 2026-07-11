import { describe, expect, it } from "vitest";
import { verifyTableRows } from "../../scripts/migrate-reminders-to-supabase";

describe("Supabase migration verification", () => {
  const columns = ["id", "text", "nullable", "enabled", "count", "created_at"];
  const source = [{ id: "c1", text: "secret text", nullable: null, enabled: false, count: 0, created_at: new Date("2026-07-12T00:00:00Z") }];
  const target = [{ id: "c1", text: "secret text", nullable: null, enabled: false, count: 0, created_at: new Date("2026-07-12T00:00:00Z") }];

  it("compares every column including timestamps, nulls, booleans, numbers and text", () => {
    expect(verifyTableRows("items", columns, source, target)).toBe(1);
    for (const column of columns.slice(1)) {
      const changed = [{ ...target[0], [column]: column === "nullable" ? "non-null" : column === "enabled" ? true : column === "count" ? 1 : column === "created_at" ? new Date("2026-07-13T00:00:00Z") : "different" }];
      expect(() => verifyTableRows("items", columns, source, changed)).toThrow(`column=${column}`);
    }
  });

  it("detects source-only and target-only IDs", () => {
    expect(() => verifyTableRows("items", columns, source, [])).toThrow("source-only=1, target-only=0");
    expect(() => verifyTableRows("items", columns, [], target)).toThrow("source-only=0, target-only=1");
  });

  it("does not put sensitive values in failures", () => {
    expect(() => verifyTableRows("items", columns, source, [{ ...target[0], text: "wrong" }])).toThrowError(/mismatch at id=c1, column=text$/);
    try { verifyTableRows("items", columns, source, [{ ...target[0], text: "wrong" }]); } catch (error) { expect(String(error)).not.toContain("secret text"); }
  });
});
