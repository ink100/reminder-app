import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("medicine expiration reminder synchronization", () => {
  it("keeps medicine create, update and soft-delete synchronized in the database transaction", async () => {
    const sql = (await readFile("docs/supabase-reminders.sql", "utf8")).toLowerCase();

    expect(sql).toContain("function public.sync_medicine_expiration_reminder()");
    expect(sql).toContain("before insert or update of name, expires_at, expiration_reminder_days, location_text, quantity_remaining, unit, deleted_at");
    expect(sql).toContain("new.expiration_reminder_id := null");
    expect(sql).toContain("药品过期提醒：");
    expect(sql).toContain("upcoming_notified_at = null");
    expect(sql).toContain("overdue_notified_at = null");
    expect(sql).toContain("create trigger medicines_sync_expiration_reminder");
  });

  it("backfills existing medicines through the synchronization trigger", async () => {
    const sql = (await readFile("docs/supabase-reminders.sql", "utf8")).toLowerCase();

    expect(sql).toContain("update public.medicines");
    expect(sql).toContain("set expiration_reminder_days = expiration_reminder_days");
    expect(sql).toContain("expires_at is not null");
    expect(sql).toContain("and deleted_at is null");
    expect(sql).toContain("expiration_reminder_id is null");
    expect(sql).toContain("not exists (select 1 from public.reminders");
  });
});
