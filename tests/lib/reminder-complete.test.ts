import { describe, expect, it } from "vitest";

import { buildReminderCompletionUpdate } from "@/lib/reminder-complete";

describe("buildReminderCompletionUpdate", () => {
  it("marks one-time reminders as completed", () => {
    const completedAt = new Date("2026-04-19T08:00:00.000Z");

    const result = buildReminderCompletionUpdate({
      completedAt,
      recurrenceType: null,
      recurrenceInterval: null,
    });

    expect(result.recurrenceAdvanced).toBe(false);
    expect(result.data).toEqual({ completedAt });
  });

  it("advances recurring reminders in place and keeps them active", () => {
    const result = buildReminderCompletionUpdate({
      completedAt: new Date("2026-04-19T08:00:00.000Z"),
      recurrenceType: "weekly",
      recurrenceInterval: 1,
    });

    expect(result.recurrenceAdvanced).toBe(true);
    expect(result.data.completedAt).toBeNull();
    expect(result.data.dueAt?.toISOString()).toBe("2026-04-26T08:00:00.000Z");
    expect(result.data.upcomingNotifiedAt).toBeNull();
    expect(result.data.overdueNotifiedAt).toBeNull();
  });

  it("advances yearly recurring reminders with leap-day clamping", () => {
    const result = buildReminderCompletionUpdate({
      completedAt: new Date("2024-02-29T08:00:00.000Z"),
      recurrenceType: "yearly",
      recurrenceInterval: 1,
    });

    expect(result.recurrenceAdvanced).toBe(true);
    expect(result.data.completedAt).toBeNull();
    expect(result.data.dueAt?.toISOString()).toBe("2025-02-28T08:00:00.000Z");
  });
});
