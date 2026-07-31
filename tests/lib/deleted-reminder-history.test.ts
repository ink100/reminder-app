import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("deleted reminder history", () => {
  it("loads soft-deleted reminders separately and exposes a deleted-records view", async () => {
    const [page, dashboard] = await Promise.all([
      readFile("app/(protected)/reminders/page.tsx", "utf8"),
      readFile("components/reminders/reminders-dashboard.tsx", "utf8"),
    ]);

    expect(page).toContain("deletedAt: { not: null }");
    expect(page).toContain("deletedReminders=");
    expect(page).toContain("deletedCount=");
    expect(page).toContain("supabaseModels.reminder.count");
    expect(dashboard).toContain("已删除记录");
    expect(dashboard).toContain("DeletedReminderList");
  });
});
