import { describe, expect, it } from "vitest";

import {
  buildLicenseStoreReminderData,
  buildLicenseStoreReminderTitle,
} from "@/lib/license-store-reminder";

describe("license store reminder synchronization", () => {
  const syncedAt = new Date("2026-07-30T09:30:00.000Z");

  it("keeps the existing due time and makes it yearly when it is within one year", () => {
    const expiresAt = new Date("2027-07-30T09:30:00.000Z");

    expect(buildLicenseStoreReminderData({
      shopName: "测试店铺",
      phone: "13800138000",
      activationCode: "activation-code",
      expiresAt,
    }, syncedAt)).toEqual({
      title: "测试店铺激活码到期",
      description: "店铺：测试店铺\n手机号：13800138000",
      activationCode: "activation-code",
      dueAt: expiresAt,
      priority: "medium",
      category: "授权与店铺",
      remindBeforeDays: 3,
      remindBeforeHours: 24,
      overdueRemindEnabled: true,
      recurrenceType: "yearly",
      recurrenceInterval: 1,
      completedAt: null,
      upcomingNotifiedAt: null,
      overdueNotifiedAt: null,
      deletedAt: null,
    });
  });

  it("does not make reminders beyond one year recurring", () => {
    const reminder = buildLicenseStoreReminderData({
      shopName: "长期店铺",
      phone: "13800138000",
      activationCode: "activation-code",
      expiresAt: new Date("2027-07-30T09:30:00.001Z"),
    }, syncedAt);

    expect(reminder.recurrenceType).toBeNull();
    expect(reminder.recurrenceInterval).toBeNull();
  });

  it("defaults a missing due time to the synchronization time and makes it yearly", () => {
    const reminder = buildLicenseStoreReminderData({
      shopName: "无时间店铺",
      phone: "13800138000",
      activationCode: "activation-code",
      expiresAt: null,
    }, syncedAt);

    expect(reminder.dueAt).toEqual(syncedAt);
    expect(reminder.recurrenceType).toBe("yearly");
    expect(reminder.recurrenceInterval).toBe(1);
  });

  it("uses a clamped calendar-year boundary for leap day", () => {
    const leapDay = new Date("2024-02-29T09:30:00.000Z");
    const atBoundary = buildLicenseStoreReminderData({
      shopName: "闰年店铺",
      phone: "13800138000",
      activationCode: "activation-code",
      expiresAt: new Date("2025-02-28T09:30:00.000Z"),
    }, leapDay);
    const beyondBoundary = buildLicenseStoreReminderData({
      shopName: "闰年店铺",
      phone: "13800138000",
      activationCode: "activation-code",
      expiresAt: new Date("2025-02-28T09:30:00.001Z"),
    }, leapDay);

    expect(atBoundary.recurrenceType).toBe("yearly");
    expect(beyondBoundary.recurrenceType).toBeNull();
  });

  it("preserves UTC time-of-day at the exact leap-day boundary", () => {
    const boundarySync = new Date("2024-02-29T23:59:59.999Z");
    expect(buildLicenseStoreReminderData({
      shopName: "边界店铺", phone: "13800138000", activationCode: "code",
      expiresAt: new Date("2025-02-28T23:59:59.999Z"),
    }, boundarySync).recurrenceType).toBe("yearly");
    expect(buildLicenseStoreReminderData({
      shopName: "边界店铺", phone: "13800138000", activationCode: "code",
      expiresAt: new Date("2025-03-01T00:00:00.000Z"),
    }, boundarySync).recurrenceType).toBeNull();
  });

  it("normalizes whitespace in the generated reminder title", () => {
    expect(buildLicenseStoreReminderTitle("  示例店铺  ")).toBe("示例店铺激活码到期");
  });
});
