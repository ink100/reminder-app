import { prisma } from "@/lib/prisma";

export const SSL_CERT_REMINDER_TITLE = "SSL 证书到期：daydreams.cn";
export const SSL_CERT_REMINDER_CATEGORY = "SSL证书";
export const SSL_CERT_DOMAIN = "*.daydreams.cn / daydreams.cn";

function buildDescription(expiry: Date, daysRemaining: number | null) {
  const lines = [
    "系统自动维护的 SSL 证书到期提醒。",
    "证书更新脚本或 SSL 管理页读取到新的证书有效期后，会自动同步本提醒的截止时间。",
    `证书域名：${SSL_CERT_DOMAIN}`,
    `证书到期时间：${expiry.toLocaleString("zh-CN", { hour12: false })}`,
  ];

  if (daysRemaining !== null) {
    lines.push(`当前剩余天数：${daysRemaining} 天`);
  }

  return lines.join("\n");
}

function getPriority(daysRemaining: number | null) {
  if (daysRemaining !== null && daysRemaining <= 15) return "high";
  return "medium";
}

export type SyncSslCertificateReminderResult = {
  action: "created" | "updated" | "unchanged";
  reminderId: string;
  dueAt: string;
  daysRemaining: number | null;
};

export async function syncSslCertificateReminder(expiryInput: string | Date) {
  const expiry = expiryInput instanceof Date ? expiryInput : new Date(expiryInput);

  if (Number.isNaN(expiry.getTime())) {
    throw new Error("无效的 SSL 证书到期时间");
  }

  const now = new Date();
  const daysRemaining = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const normalizedDaysRemaining = Number.isFinite(daysRemaining) ? daysRemaining : null;
  const description = buildDescription(expiry, normalizedDaysRemaining);
  const priority = getPriority(normalizedDaysRemaining);

  const existing = await prisma.reminder.findFirst({
    where: {
      deletedAt: null,
      category: SSL_CERT_REMINDER_CATEGORY,
      title: SSL_CERT_REMINDER_TITLE,
    },
    orderBy: { createdAt: "asc" },
  });

  if (!existing) {
    const reminder = await prisma.reminder.create({
      data: {
        title: SSL_CERT_REMINDER_TITLE,
        description,
        dueAt: expiry,
        priority,
        category: SSL_CERT_REMINDER_CATEGORY,
        remindBeforeDays: 15,
        remindBeforeHours: 0,
        overdueRemindEnabled: true,
        completedAt: null,
        upcomingNotifiedAt: null,
        overdueNotifiedAt: null,
      },
    });

    return {
      action: "created",
      reminderId: reminder.id,
      dueAt: reminder.dueAt.toISOString(),
      daysRemaining: normalizedDaysRemaining,
    } satisfies SyncSslCertificateReminderResult;
  }

  const dueChanged = existing.dueAt.getTime() !== expiry.getTime();
  const shouldUpdate =
    dueChanged ||
    existing.description !== description ||
    existing.priority !== priority ||
    existing.completedAt !== null;

  if (!shouldUpdate) {
    return {
      action: "unchanged",
      reminderId: existing.id,
      dueAt: existing.dueAt.toISOString(),
      daysRemaining: normalizedDaysRemaining,
    } satisfies SyncSslCertificateReminderResult;
  }

  const reminder = await prisma.reminder.update({
    where: { id: existing.id },
    data: {
      description,
      dueAt: expiry,
      priority,
      completedAt: null,
      ...(dueChanged ? { upcomingNotifiedAt: null, overdueNotifiedAt: null } : {}),
    },
  });

  return {
    action: "updated",
    reminderId: reminder.id,
    dueAt: reminder.dueAt.toISOString(),
    daysRemaining: normalizedDaysRemaining,
  } satisfies SyncSslCertificateReminderResult;
}
