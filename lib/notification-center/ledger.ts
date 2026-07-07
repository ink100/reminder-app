import { parseJsonObject } from "@/lib/notification-center/types";
import { eq, JsonObject, newId, PushLedgerRow, selectOne, upsertRow, updateRows } from "@/lib/notification-center/store";

type LedgerStatus = "Pending" | "Processing" | "Success" | "RetryWaiting" | "Failed" | "DeadLetter" | "Cancelled";

function getBusinessField(payload: JsonObject, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

function getLedgerTarget(channelType: string, config: JsonObject) {
  if (channelType === "Telegram") return typeof config.chatId === "string" ? config.chatId : null;
  if (channelType === "Webhook") return typeof config.url === "string" ? config.url : null;
  if (channelType === "Email") return typeof config.to === "string" ? config.to : null;
  return null;
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
  const existing = await selectOne<PushLedgerRow>("push_ledgers", { filters: { queue_job_id: eq(input.queueJobId) } });
  return upsertRow<PushLedgerRow>("push_ledgers", {
    id: existing?.id ?? newId("pl"),
    queue_job_id: input.queueJobId,
    notification_id: input.notificationId,
    channel_id: input.channelId,
    channel_type: input.channelType,
    channel_name: input.channelName,
    target: getLedgerTarget(input.channelType, channelConfig),
    title: input.title,
    content: input.content,
    raw_payload: payload,
    business_type: existing?.business_type ?? getBusinessField(payload, ["businessType", "business_type", "type", "eventType"]),
    business_id: existing?.business_id ?? getBusinessField(payload, ["businessId", "business_id", "orderId", "order_id", "id"]),
    status: existing?.status ?? "Pending",
    queued_at: existing?.queued_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, "queue_job_id");
}

export async function updatePushLedgerForJob(queueJobId: string, status: LedgerStatus, data: {
  request?: unknown;
  response?: unknown;
  error?: string | null;
  durationMs?: number | null;
  retryCount?: number;
  attemptIncrement?: boolean;
} = {}) {
  const existing = await selectOne<PushLedgerRow>("push_ledgers", { filters: { queue_job_id: eq(queueJobId) } });
  if (!existing) return null;

  const now = new Date().toISOString();
  const patchData: Record<string, unknown> = {
    status,
    updated_at: now,
  };
  if (data.request !== undefined) patchData.request = data.request;
  if (data.response !== undefined) patchData.response = data.response;
  if (data.error !== undefined) patchData.error = data.error;
  if (data.durationMs !== undefined) patchData.duration_ms = data.durationMs;
  if (data.retryCount !== undefined) patchData.retry_count = data.retryCount;
  if (data.attemptIncrement) patchData.attempt_count = existing.attempt_count + 1;
  if (status === "Processing") patchData.started_at = now;
  if (status === "Success") patchData.sent_at = now;
  if (status === "Failed" || status === "DeadLetter") patchData.failed_at = now;
  if (status === "RetryWaiting") patchData.last_retry_at = now;

  const rows = await updateRows<PushLedgerRow>("push_ledgers", { queue_job_id: eq(queueJobId) }, patchData);
  return rows[0] ?? null;
}
