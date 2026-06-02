import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { syncSslCertificateReminder } from "@/lib/ssl-reminder";

async function main() {
  const expiry = process.argv[2];

  if (!expiry) {
    throw new Error("缺少证书到期时间参数");
  }

  const result = await syncSslCertificateReminder(expiry);
  console.log(
    `ssl reminder ${result.action}: id=${result.reminderId}, dueAt=${result.dueAt}, daysRemaining=${result.daysRemaining}`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
