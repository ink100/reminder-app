import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { splitSupabaseMigrationSql, verifyTableRows } from "../../scripts/migrate-reminders-to-supabase";

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

  it("imports legacy rows before post-import ownership constraints and synchronization", () => {
    const sql = readFileSync(resolve("docs/supabase-reminders.sql"), "utf8");
    const { preImportSql, postImportSql } = splitSupabaseMigrationSql(sql);
    expect(preImportSql).toContain("alter column expires_at drop not null");
    expect(preImportSql).toContain("drop index if exists license_store_accounts_reminder_id_unique");
    expect(preImportSql).toContain("drop index if exists ssl_certificate_active_reminder_uidx");
    expect(preImportSql).not.toContain("alter column reminder_id set not null");
    expect(postImportSql).toContain("alter column reminder_id set not null");
    expect(postImportSql).toContain("synchronization left a schedule mismatch");
    expect(preImportSql).not.toContain("Normalize imported legacy free-form categories");
    expect(postImportSql).toContain("Normalize imported legacy free-form categories");
  });

  it("defines atomic store create/update RPCs and an explicit UTC clamped-year boundary", () => {
    const sql = readFileSync(resolve("docs/supabase-reminders.sql"), "utf8");
    expect(sql).toContain("create or replace function public.utc_clamped_calendar_year_later");
    expect(sql).toContain("at time zone 'UTC'");
    expect(sql).toContain("create_license_store_account_with_reminder");
    expect(sql).toContain("update_license_store_account_with_reminder");
    expect(sql).toContain("license_store_account_with_reminder_json");
  });

  it("repairs duplicate SSL reminders and prevents another active duplicate", () => {
    const sql = readFileSync(resolve("docs/supabase-reminders.sql"), "utf8");
    expect(sql).toContain("SSL 证书到期：daydreams.cn");
    expect(sql).toContain("row_number() over");
    expect(sql).toContain("ssl_certificate_active_reminder_uidx");
    expect(sql).toContain("where deleted_at is null and title = 'SSL 证书到期：daydreams.cn'");
  });

  it("does not B-tree index opaque activation-code payloads", () => {
    const sql = readFileSync(resolve("docs/supabase-reminders.sql"), "utf8");
    expect(sql).toContain("drop index if exists license_store_accounts_activation_code_idx");
    expect(sql).not.toContain("create index if not exists license_store_accounts_activation_code_idx");
  });

  it("preserves repaired legacy schedule fields when a rerun imports null links", () => {
    const source = readFileSync(resolve("scripts/migrate-reminders-to-supabase.ts"), "utf8");
    expect(source).toContain("expires_at=coalesce(excluded.expires_at,public.license_store_accounts.expires_at)");
    expect(source).toContain("reminder_id=coalesce(excluded.reminder_id,public.license_store_accounts.reminder_id)");
  });
});
