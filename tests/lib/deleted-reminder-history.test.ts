import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("deleted reminder history", () => {
  it("loads soft-deleted reminders and exposes a deleted-records view", async () => {
    const [handler, dashboard] = await Promise.all([
      readFile("server/handlers/api/reminders/route.ts", "utf8"),
      readFile("app/components/reminders/ReminderDashboard.vue", "utf8"),
    ]);

    expect(handler).toContain("supabaseModels.reminder.findMany");
    expect(handler).not.toContain("where: { deletedAt: null }");
    expect(dashboard).toContain("已删除记录");
    expect(dashboard).toContain('const displayed = computed(() => view.value === "active" ? filtered.value : view.value === "completed" ? completed.value : deleted.value)');
    expect(dashboard).toContain("item.deletedAt");
  });
});
