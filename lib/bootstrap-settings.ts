import { prisma } from "@/lib/prisma";

export async function ensureAppSettings() {
  return prisma.appSetting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      appName: "到期提醒",
      timezone: "Asia/Shanghai",
      defaultRemindBeforeDays: 3,
      defaultRemindBeforeHours: 24,
      overdueRepeatEnabled: true,
      dailyRemindTime: "09:00",
      emailNotificationsEnabled: false,
      notificationEmail: null,
      smtpHost: null,
      smtpPort: null,
      smtpUser: null,
      smtpPassEncrypted: null,
      smtpFromEmail: null,
      smtpFromName: null,
    },
  });
}
