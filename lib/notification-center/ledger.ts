import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { parseJsonObject, stringifyJson } from "@/lib/notification-center/types";

type LedgerStatus = "Pending" | "Processing" | "Success" | "RetryWaiting" | "Failed" | "DeadLetter" | "Cancelled";

type LedgerMirrorPayload = {
  id: string;
  notification_id: string | null;
  queue_job_id: string | null;
  channel_id: string | null;
  channel_type: string;
  channel_name: string;
  target: string | null;
  title: string;
  content: string;
  raw_payload: Record<string, unknown>;
  business_type: string | null;
  business_id: string | null;
  status: string;
  retry_count: number;
  attempt_count: number;
  request: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
  queued_at: string;
  started_at: string | null;
  sent_at: string | null;
  failed_at: string | null;
  last_retry_at: string | null;
  updated_at: string;
};

function getSupabaseConfig() {
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function getTarget(channelType: string, config: Record<string, unknown>) {
  if (channelType === "Telegram") return typeof config.chatId === "string" ? config.chatId : null;
  if (channelType === "Webhook") return typeof config.url === "string" ? config.url : null;
  if (channelType === "Email") return typeof config.to === "string" ? config.to : null;
  return null;
}

function getBusinessField(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

async function mirrorLedgerToSupabase(id: string) {
  const config = getSupabaseConfig();
  if (!config) return;

  try {
    const item = await prisma.pushLedger.findUnique({ where: { id } });
    if (!item) return;

    const payload: LedgerMirrorPayload = {
      id: item.id,
      notification_id: item.notificationId,
      queue_job_id: item.queueJobId,
      channel_id: item.channelId,
      channel_type: item.channelType,
      channel_name: item.channelName,
      target: item.target,
      title: item.title,
      content: item.content,
      raw_payload: parseJsonObject(item.rawPayload),
      business_type: item.businessType,
      business_id: item.businessId,
      status: item.status,
      retry_count: item.retryCount,
      attempt_count: item.attemptCount,
      request: item.request ? parseJsonObject(item.request) : null,
      response: item.response ? parseJsonObject(item.response) : null,
      error: item.error,
      duration_ms: item.durationMs,
      created_at: item.createdAt.toISOString(),
      queued_at: item.queuedAt.toISOString(),
      started_at: item.startedAt?.toISOString() ?? null,
      sent_at: item.sentAt?.toISOString() ?? null,
      failed_at: item.failedAt?.toISOString() ?? null,
      last_retry_at: item.lastRetryAt?.toISOString() ?? null,
      updated_at: item.updatedAt.toISOString(),
    };

    const response = await fetch(`${config.url}/rest/v1/push_ledgers?on_conflict=id`, {
      method: "POST",
      headers: {
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn("[notification-center] Supabase ledger mirror failed", response.status, text.slice(0, 300));
    }
  } catch (error) {
    console.warn("[notification-center] Supabase ledger mirror skipped", error);
  }
}

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
      target: getTarget(input.channelType, channelConfig),
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
      target: getTarget(input.channelType, channelConfig),
      title: input.title,
      content: input.content,
      rawPayload: stringifyJson(payload),
      businessType: getBusinessField(payload, ["businessType", "business_type", "type", "eventType"]),
      businessId: getBusinessField(payload, ["businessId", "business_id", "orderId", "order_id", "id"]),
      status: "Pending",
      queuedAt: new Date(),
    },
  });
  await mirrorLedgerToSupabase(ledger.id);
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
  await mirrorLedgerToSupabase(ledger.id);
  return ledger;
}
