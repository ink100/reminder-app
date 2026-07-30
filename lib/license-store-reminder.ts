import { computeNextRecurringDueAt } from "@/lib/reminder-recurrence";

type LicenseStoreReminderSource = {
  shopName: string;
  phone: string;
  activationCode: string;
  expiresAt?: Date | null;
};

export function buildLicenseStoreReminderTitle(shopName: string) {
  return `${shopName.trim()}激活码到期`;
}

export function buildLicenseStoreReminderSchedule(expiresAt?: Date | null, syncedAt = new Date()) {
  const dueAt = expiresAt ?? syncedAt;
  const yearlyBoundary = computeNextRecurringDueAt({
    completedAt: syncedAt,
    recurrenceType: "yearly",
    recurrenceInterval: 1,
  });
  const isYearly = dueAt.getTime() <= yearlyBoundary.getTime();

  return {
    dueAt,
    recurrenceType: isYearly ? "yearly" : null,
    recurrenceInterval: isYearly ? 1 : null,
  } as const;
}

export function buildLicenseStoreReminderData(source: LicenseStoreReminderSource, syncedAt = new Date()) {
  const shopName = source.shopName.trim();
  return {
    title: buildLicenseStoreReminderTitle(shopName),
    description: `店铺：${shopName}\n手机号：${source.phone.trim()}`,
    activationCode: source.activationCode.trim(),
    ...buildLicenseStoreReminderSchedule(source.expiresAt, syncedAt),
    priority: "medium",
    category: "授权与店铺",
    remindBeforeDays: 3,
    remindBeforeHours: 24,
    overdueRemindEnabled: true,
    completedAt: null,
    upcomingNotifiedAt: null,
    overdueNotifiedAt: null,
    deletedAt: null,
  } as const;
}
