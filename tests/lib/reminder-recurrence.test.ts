import { describe, expect, it } from "vitest";

import { computeNextRecurringDueAt } from "@/lib/reminder-recurrence";

describe("computeNextRecurringDueAt", () => {
  it("shifts daily reminders from completedAt", () => {
    const result = computeNextRecurringDueAt({
      completedAt: new Date("2026-04-19T08:00:00.000Z"),
      recurrenceType: "daily",
      recurrenceInterval: 2,
    });

    expect(result.toISOString()).toBe("2026-04-21T08:00:00.000Z");
  });

  it("shifts weekly reminders from completedAt", () => {
    const result = computeNextRecurringDueAt({
      completedAt: new Date("2026-04-19T08:00:00.000Z"),
      recurrenceType: "weekly",
      recurrenceInterval: 1,
    });

    expect(result.toISOString()).toBe("2026-04-26T08:00:00.000Z");
  });

  it("shifts monthly reminders from completedAt", () => {
    const result = computeNextRecurringDueAt({
      completedAt: new Date("2026-01-31T08:00:00.000Z"),
      recurrenceType: "monthly",
      recurrenceInterval: 1,
    });

    expect(result.toISOString()).toBe("2026-02-28T08:00:00.000Z");
  });
});
