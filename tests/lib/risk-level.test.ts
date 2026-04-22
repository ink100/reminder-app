import { describe, expect, it } from "vitest";

import { getReminderRiskLevel } from "@/lib/risk-level";

describe("getReminderRiskLevel", () => {
  it("returns completed when completedAt exists", () => {
    const result = getReminderRiskLevel({
      dueAt: new Date("2026-04-20T10:00:00.000Z"),
      completedAt: new Date("2026-04-19T10:00:00.000Z"),
      remindBeforeDays: 3,
      now: new Date("2026-04-19T12:00:00.000Z"),
    });

    expect(result).toBe("completed");
  });

  it("returns overdue when due date is in the past", () => {
    const result = getReminderRiskLevel({
      dueAt: new Date("2026-04-19T09:00:00.000Z"),
      remindBeforeDays: 3,
      now: new Date("2026-04-19T12:00:00.000Z"),
    });

    expect(result).toBe("overdue");
  });

  it("returns urgent when due within 24 hours", () => {
    const result = getReminderRiskLevel({
      dueAt: new Date("2026-04-20T06:00:00.000Z"),
      remindBeforeDays: 3,
      now: new Date("2026-04-19T12:00:00.000Z"),
    });

    expect(result).toBe("urgent");
  });

  it("returns warning when due within reminder window", () => {
    const result = getReminderRiskLevel({
      dueAt: new Date("2026-04-21T11:00:00.000Z"),
      remindBeforeDays: 3,
      now: new Date("2026-04-19T12:00:00.000Z"),
    });

    expect(result).toBe("warning");
  });

  it("returns normal when due outside reminder window", () => {
    const result = getReminderRiskLevel({
      dueAt: new Date("2026-04-30T12:00:00.000Z"),
      remindBeforeDays: 3,
      now: new Date("2026-04-19T12:00:00.000Z"),
    });

    expect(result).toBe("normal");
  });
});
