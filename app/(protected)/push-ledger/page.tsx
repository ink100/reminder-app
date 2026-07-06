import { PushLedgerDashboard } from "@/components/notification-center/push-ledger-dashboard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PushLedgerPage() {
  const [items, total, success, pending, failed] = await Promise.all([
    prisma.pushLedger.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.pushLedger.count(),
    prisma.pushLedger.count({ where: { status: "Success" } }),
    prisma.pushLedger.count({ where: { status: { in: ["Pending", "Processing", "RetryWaiting"] } } }),
    prisma.pushLedger.count({ where: { status: { in: ["Failed", "DeadLetter"] } } }),
  ]);

  return <PushLedgerDashboard items={items} stats={{ total, success, pending, failed }} />;
}
