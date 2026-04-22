import { describe, expect, it } from "vitest";

import { collectReminderNotifications, isMailTransportConfigured } from "@/lib/reminder-notifications";

describe("reminder notifications", () => {
  it("selects due-soon and overdue reminders only once", () => {
    const result = collectReminderNotifications(
      [
        {
          id: "soon",
          title: "合同续签",
          dueAt: new Date("2026-04-20T12:00:00.000Z"),
          remindBeforeDays: 1,
          remindBeforeHours: 2,
          overdueRemindEnabled: true,
          upcomingNotifiedAt: null,
          overdueNotifiedAt: null,
        },
        {
          id: "overdue",
          title: "缴房租",
          dueAt: new Date("2026-04-18T12:00:00.000Z"),
          remindBeforeDays: 1,
          remindBeforeHours: 2,
          overdueRemindEnabled: true,
          upcomingNotifiedAt: new Date("2026-04-18T10:00:00.000Z"),
          overdueNotifiedAt: null,
        },
        {
          id: "done",
          title: "已发过",
          dueAt: new Date("2026-04-18T12:00:00.000Z"),
          remindBeforeDays: 1,
          remindBeforeHours: 2,
          overdueRemindEnabled: true,
          upcomingNotifiedAt: new Date("2026-04-18T10:00:00.000Z"),
          overdueNotifiedAt: new Date("2026-04-18T13:00:00.000Z"),
        },
      ],
      new Date("2026-04-19T12:00:00.000Z"),
    );

    expect(result).toEqual([
      { id: "soon", kind: "upcoming" },
      { id: "overdue", kind: "overdue" },
    ]);
  });

  it("reports mail transport readiness from env", () => {
    expect(
      isMailTransportConfigured({
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_USER: "user",
        SMTP_PASS: "pass",
        SMTP_FROM_EMAIL: "bot@example.com",
      }),
    ).toBe(true);

    expect(isMailTransportConfigured({})).toBe(false);
  });
});
