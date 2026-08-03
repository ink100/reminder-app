export const REMINDER_GROUPS = ["授权与店铺", "服务器与证书", "账单与续费", "宠物健康", "日常生活", "工作与项目", "其他"] as const;
export type ReminderGroup = typeof REMINDER_GROUPS[number];
export type RiskLevel = "normal" | "warning" | "urgent" | "overdue" | "completed";
export type ReminderItem = {
  id: string;
  title: string;
  description: string | null;
  activationCode?: string | null;
  hasActivationCode?: boolean;
  activationContact: string | null;
  dueAt: string;
  priority: "low" | "medium" | "high";
  category: string | null;
  completedAt: string | null;
  deletedAt?: string | null;
  remindBeforeDays: number;
  remindBeforeHours?: number;
  overdueRemindEnabled?: boolean;
  recurrenceType?: "daily" | "weekly" | "monthly" | "yearly" | null;
  recurrenceInterval?: number | null;
};

const aliases: Record<string, ReminderGroup> = {
  激活码: "授权与店铺", 授权: "授权与店铺", 店铺: "授权与店铺",
  SSL证书: "服务器与证书", 证书: "服务器与证书", 域名: "服务器与证书", 服务器: "服务器与证书",
  账单: "账单与续费", 续费: "账单与续费", 宠物: "宠物健康", 生活: "日常生活", 工作: "工作与项目", 项目: "工作与项目",
};

export function reminderGroup(category?: string | null): ReminderGroup {
  const value = category?.trim();
  return (value && (REMINDER_GROUPS as readonly string[]).includes(value) ? value : aliases[value || ""]) as ReminderGroup || "其他";
}

export function riskLevel(item: ReminderItem, now = new Date()): RiskLevel {
  if (item.completedAt) return "completed";
  const hours = (new Date(item.dueAt).getTime() - now.getTime()) / 3_600_000;
  if (hours < 0) return "overdue";
  if (hours <= 24) return "urgent";
  if (hours <= item.remindBeforeDays * 24) return "warning";
  return "normal";
}

/** Matches the legacy datetime-local contract: display the first 16 ISO characters without a timezone. */
export function isoToLegacyDateTimeValue(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16);
}

/** Matches the legacy form serialization: the timezone-less wall time is interpreted in the browser timezone. */
export function legacyDateTimeValueToIso(value: string): string {
  return new Date(value).toISOString();
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
