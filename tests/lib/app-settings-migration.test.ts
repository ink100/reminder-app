import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assertFrozenSource, verifyAppSettings } from "../../scripts/migrate-app-settings-to-supabase";

const row = { id: 1, app_name: "提醒", smtp_pass_encrypted: "opaque+/=", r2_secret_key: "plain", created_at: new Date("2026-07-12T00:00:00Z"), updated_at: new Date("2026-07-12T01:00:00Z") };

describe("AppSetting migration verification", () => {
  it("accepts an exact row including equivalent timestamp strings", () => {
    expect(verifyAppSettings([row], [{ ...row, created_at: "2026-07-12T00:00:00.000Z", updated_at: "2026-07-12T01:00:00.000Z" }])).toBe(1);
  });
  it("aborts on secret conflicts without including values in errors", () => {
    expect(() => verifyAppSettings([row], [{ ...row, smtp_pass_encrypted: "different" }])).toThrow("column=smtp_pass_encrypted");
    try { verifyAppSettings([row], [{ ...row, smtp_pass_encrypted: "different" }]); } catch (error) { expect(String(error)).not.toContain("opaque"); }
  });
  it("aborts on target-only and source-only rows", () => {
    expect(() => verifyAppSettings([row], [])).toThrow("source-only=1, target-only=0");
    expect(() => verifyAppSettings([], [row])).toThrow("source-only=0, target-only=1");
  });

  it("requires an explicit freeze or an inactive service", async () => {
    await expect(assertFrozenSource({}, async () => "active")).rejects.toThrow("must be inactive");
    await expect(assertFrozenSource({}, async () => "inactive")).resolves.toBeUndefined();
    await expect(assertFrozenSource({ REMINDER_APP_SOURCE_FROZEN: "confirmed" }, async () => "active")).resolves.toBeUndefined();
  });

  it("contains the lock, deny-by-default security, schema validation and transactional marker DDL", async () => {
    const sql = (await readFile("docs/supabase-app-settings.sql", "utf8")).toLowerCase();
    expect(sql).toContain("lock table public.app_settings in access exclusive mode");
    expect(sql).toContain("aclexplode");
    expect(sql).toContain("revoke all privileges on table public.%i from");
    expect(sql).toContain("unexpected explicit table privileges remain");
    expect(sql).toContain("alter table public.app_settings force row level security");
    expect(sql).toContain("alter table public.app_migrations force row level security");
    expect(sql).toContain("drop policy");
    expect(sql).toContain("information_schema.columns");
    expect(sql).toContain("create table if not exists public.app_migrations");
    expect(sql).toContain("app_migrations schema differs from expected columns/types/nullability/defaults");
    expect(sql).toContain("app_migrations primary key differs from expected");
  });
});
