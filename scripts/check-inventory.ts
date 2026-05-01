import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { ensureAppSettings } from "@/lib/bootstrap-settings";
import { canSendMail, createMailTransport, getMailFrom } from "@/lib/mailer";
import { updateInventoryNotificationStates } from "@/lib/inventory-service";

async function main() {
  const settings = await ensureAppSettings();
  const notifications = await updateInventoryNotificationStates();
  if (notifications.length === 0) {
    console.log("skip: no inventory notifications");
    return;
  }

  if (!settings.emailNotificationsEnabled || !settings.notificationEmail) {
    console.log("skip: email notifications disabled or recipient missing");
    return;
  }

  if (!canSendMail(settings)) {
    console.log("skip: smtp config missing");
    return;
  }

  const transport = createMailTransport(settings);
  await transport.sendMail({
    from: getMailFrom(settings),
    to: settings.notificationEmail,
    subject: `库存通知｜${notifications.length} 个商品命中阈值`,
    text: [
      `${settings.appName} - 库存通知`,
      "",
      "以下商品当前库存落在配置范围内：",
      ...notifications.map(
        (item) =>
          `- [${item.sourceLabel}] ${item.name}｜库存 ${item.stock}｜通知区间 ${item.minNotifyStock}-${item.maxNotifyStock}${item.productUrl ? `｜${item.productUrl}` : ""}`,
      ),
    ].join("\n"),
  });

  console.log(`sent ${notifications.length} inventory notifications`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
