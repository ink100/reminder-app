import { prisma } from "@/lib/prisma";
import { parseJsonObject, stringifyJson } from "@/lib/notification-center/types";
import { getBusinessField, getLedgerTarget, mirrorPushLedgerById } from "@/lib/notification-center/supabase-mirror";

type LedgerStatus = "Pending" | "Processing" | "Success" | "RetryWaiting" | "Failed" | "DeadLetter" | "Cancelled";

export async function createPushLedgerForJob(input: {
  queueJobId: string;
  notificationId: string;
  channelId: string;
  channelType: string;
  channelName: string;
  channelConfig: string;
  title: string;
  content: string;
  rawPayload: Record<string, unknown>;
}) {
  const channelConfig = parseJsonObject(input.channelConfig);
  const payload = input.rawPayload;
  const ledger = await prisma.pushLedger.upsert({
    where: { queueJobId: input.queueJobId },
    update: {
      channelType: input.channelType,
      channelName: input.channelName,
      target: getLedgerTarget(input.channelType, channelConfig),
      title: input.title,
      content: input.content,
      rawPayload: stringifyJson(payload),
    },
    create: {
      queueJobId: input.queueJobId,
      notificationId: input.notificationId,
      channelId: input.channelId,
      channelType: input.channelType,
      channelName: input.channelName,
      target: getLedgerTarget(input.channelType, channelConfig),
      title: input.title,
      content: input.content,
      rawPayload: stringifyJson(payload),
      businessType: getBusinessField(payload, ["businessType", "business_type", "type", "eventType"]),
      businessId: getBusinessField(payload, ["businessId", "business_id", "orderId", "order_id", "id"]),
      status: "Pending",
      queuedAt: new Date(),
    },
  });
  await mirrorPushLedgerById(ledger.id);
  return ledger;
}

export async function updatePushLedgerForJob(queueJobId: string, status: LedgerStatus, data: {
  request?: unknown;
  response?: unknown;
  error?: string | null;
  durationMs?: number | null;
  retryCount?: number;
  attemptIncrement?: boolean;
} = {}) {
  const now = new Date();
  const existing = await prisma.pushLedger.findUnique({ where: { queueJobId } });
  if (!existing) return null;

  const ledger = await prisma.pushLedger.update({
    where: { queueJobId },
    data: {
      status,
      request: data.request === undefined ? undefined : stringifyJson(data.request),
      response: data.response === undefined ? undefined : stringifyJson(data.response),
      error: data.error === undefined ? undefined : data.error,
      durationMs: data.durationMs === undefined ? undefined : data.durationMs,
      retryCount: data.retryCount === undefined ? undefined : data.retryCount,
      attemptCount: data.attemptIncrement ? { increment: 1 } : undefined,
      startedAt: status === "Processing" ? now : undefined,
      sentAt: status === "Success" ? now : undefined,
      failedAt: status === "Failed" || status === "DeadLetter" ? now : undefined,
      lastRetryAt: status === "RetryWaiting" ? now : undefined,
    },
  });
  await mirrorPushLedgerById(ledger.id);
  return ledger;
}
