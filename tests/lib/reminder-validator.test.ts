import { describe, expect, it } from "vitest";

import { reminderInputSchema } from "@/lib/validators/reminder";

describe("reminderInputSchema", () => {
  it("accepts activation-code reminders", () => {
    const result = reminderInputSchema.parse({
      title: "会员激活码到期",
      description: "提前续费",
      dueAt: "2026-05-01T08:00:00.000Z",
      priority: "high",
      category: "账号",
      remindBeforeDays: 3,
      remindBeforeHours: 0,
      overdueRemindEnabled: true,
      recurrenceType: null,
      recurrenceInterval: null,
      activationCode: "ABC-123-XYZ",
      activationContact: "微信: vip_support",
    });

    expect(result.activationCode).toBe("ABC-123-XYZ");
    expect(result.activationContact).toBe("微信: vip_support");
    expect(result.remindBeforeHours).toBe(0);
  });

  it("allows normal reminders without activation code", () => {
    const result = reminderInputSchema.parse({
      title: "合同续签",
      description: null,
      dueAt: "2026-05-01T08:00:00.000Z",
      priority: "medium",
      category: null,
      remindBeforeDays: 3,
      remindBeforeHours: 0,
      overdueRemindEnabled: true,
      recurrenceType: null,
      recurrenceInterval: null,
      activationCode: null,
      activationContact: null,
    });

    expect(result.activationCode).toBeNull();
    expect(result.activationContact).toBeNull();
  });

  it("allows yearly recurring reminders", () => {
    const result = reminderInputSchema.parse({
      title: "年度证书到期",
      description: null,
      dueAt: "2026-05-01T08:00:00.000Z",
      priority: "medium",
      category: "证书",
      remindBeforeDays: 30,
      remindBeforeHours: 0,
      overdueRemindEnabled: true,
      recurrenceType: "yearly",
      recurrenceInterval: 1,
      activationCode: null,
      activationContact: null,
    });

    expect(result.recurrenceType).toBe("yearly");
    expect(result.recurrenceInterval).toBe(1);
  });
});
