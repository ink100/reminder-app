import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});

const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.appSetting.upsert({
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

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
