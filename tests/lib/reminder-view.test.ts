import { describe, expect, it } from "vitest";

import { buildReminderStats, filterReminders, type ReminderListItem } from "@/lib/reminder-view";
import { getReminderKindLabel } from "@/lib/reminder-kind";

const reminders: ReminderListItem[] = [
  {
    id: "1",
    title: "合同续签",
    description: "工作合同",
    activationCode: null,
    activationContact: null,
    dueAt: "2026-04-22T10:00:00.000Z",
    priority: "high",
    category: "工作",
    completedAt: null,
    remindBeforeDays: 3,
  },
  {
    id: "2",
    title: "缴房租",
    description: null,
    activationCode: null,
    activationContact: null,
    dueAt: "2026-04-19T09:00:00.000Z",
    priority: "medium",
    category: "账单",
    completedAt: null,
    remindBeforeDays: 3,
  },
  {
    id: "3",
    title: "归档材料",
    description: "已完成",
    activationCode: null,
    activationContact: null,
    dueAt: "2026-04-30T09:00:00.000Z",
    priority: "low",
    category: null,
    completedAt: "2026-04-18T09:00:00.000Z",
    remindBeforeDays: 3,
  },
];

describe("reminder view helpers", () => {
  it("builds stats by risk level", () => {
    expect(buildReminderStats(reminders, new Date("2026-04-19T12:00:00.000Z"))).toEqual({
      total: 3,
      warning: 1,
      urgent: 0,
      overdue: 1,
      completed: 1,
    });
  });

  it("filters reminders by selected stat", () => {
    const result = filterReminders(reminders, {
      search: "",
      status: "overdue",
      priority: "all",
      now: new Date("2026-04-19T12:00:00.000Z"),
    });

    expect(result.map((item) => item.id)).toEqual(["2"]);
  });

  it("filters reminders by search and priority", () => {
    const result = filterReminders(reminders, {
      search: "合同",
      status: "all",
      priority: "high",
      now: new Date("2026-04-19T12:00:00.000Z"),
    });

    expect(result.map((item) => item.id)).toEqual(["1"]);
  });

  it("supports activation-code reminders in search and label", () => {
    const result = filterReminders(
      [
        ...reminders,
        {
          id: "4",
          title: "会员续费",
          description: null,
          activationCode: "VIP-2026-CODE",
          activationContact: "wx-9988",
          dueAt: "2026-04-25T10:00:00.000Z",
          priority: "medium",
          category: "账号",
          completedAt: null,
          remindBeforeDays: 3,
        },
      ],
      {
        search: "VIP-2026",
        status: "all",
        priority: "all",
        now: new Date("2026-04-19T12:00:00.000Z"),
      },
    );

    expect(result.map((item) => item.id)).toEqual(["4"]);
    expect(getReminderKindLabel(result[0]?.activationCode ?? null)).toBe("激活码通知");
  });

  it("supports activation contact in search", () => {
    const result = filterReminders(
      [
        ...reminders,
        {
          id: "4",
          title: "会员续费",
          description: null,
          activationCode: "VIP-2026-CODE",
          activationContact: "telegram:vip_support",
          dueAt: "2026-04-25T10:00:00.000Z",
          priority: "medium",
          category: "账号",
          completedAt: null,
          remindBeforeDays: 3,
        },
      ],
      {
        search: "vip_support",
        status: "all",
        priority: "all",
        now: new Date("2026-04-19T12:00:00.000Z"),
      },
    );

    expect(result.map((item) => item.id)).toEqual(["4"]);
  });
});
