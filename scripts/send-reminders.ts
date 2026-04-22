import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { canSendMail, createMailTransport, getMailFrom } from "@/lib/mailer";
import { collectReminderNotifications } from "@/lib/reminder-notifications";

async function main() {
  const settings = await prisma.appSetting.findUnique({ where: { id: 1 } });

  if (!settings?.emailNotificationsEnabled || !settings.notificationEmail) {
    console.log("skip: email notifications disabled or recipient missing");
    return;
  }

  if (!canSendMail(settings)) {
    console.log("skip: smtp config missing");
    return;
  }

  const reminders = await prisma.reminder.findMany({
    where: {
      deletedAt: null,
      completedAt: null,
    },
    orderBy: { dueAt: "asc" },
  });

  const notifications = collectReminderNotifications(reminders, new Date());

  if (notifications.length === 0) {
    console.log("skip: no reminders to send");
    return;
  }

  const transport = createMailTransport(settings);
  let sent = 0;

  for (const notification of notifications) {
    const reminder = reminders.find((item) => item.id === notification.id);
    if (!reminder) {
      continue;
    }

    const subjectPrefix = notification.kind === "upcoming" ? "即将到期提醒" : "已超期提醒";
    const intro =
      notification.kind === "upcoming"
        ? "这条提醒已经进入提醒窗口，请尽快处理。"
        : "这条提醒已经超期，请尽快处理。";

    await transport.sendMail({
      from: getMailFrom(settings),
      to: settings.notificationEmail,
      subject: `${subjectPrefix}｜${reminder.title}`,
      text: [
        `${settings.appName} - ${subjectPrefix}`,
        "",
        intro,
        `标题：${reminder.title}`,
        reminder.activationCode ? `激活码：${reminder.activationCode}` : null,
        reminder.activationContact ? `联系方式：${reminder.activationContact}` : null,
        `分类：${reminder.category ?? "未分类"}`,
        `截止时间：${reminder.dueAt.toLocaleString("zh-CN", { hour12: false })}`,
        reminder.description ? `说明：${reminder.description}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    });

    await prisma.reminder.update({
      where: { id: reminder.id },
      data:
        notification.kind === "upcoming"
          ? { upcomingNotifiedAt: new Date() }
          : { overdueNotifiedAt: new Date() },
    });

    sent += 1;
  }

  console.log(`sent ${sent} reminder emails`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
