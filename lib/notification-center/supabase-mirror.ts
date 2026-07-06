import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { parseJsonObject } from "@/lib/notification-center/types";

type JsonObject = Record<string, unknown>;
type SupabaseRow = Record<string, unknown>;

type MirrorConfig = {
  url: string;
  key: string;
};

function getSupabaseConfig(): MirrorConfig | null {
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

async function upsertRow(table: string, row: SupabaseRow, conflict = "id") {
  const config = getSupabaseConfig();
  if (!config) return { skipped: true as const, reason: "missing-supabase-config" };

  try {
    const response = await fetch(`${config.url}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
      method: "POST",
      headers: {
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(row),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn("[notification-center] Supabase mirror failed", table, response.status, text.slice(0, 500));
      return { skipped: false as const, ok: false, status: response.status, error: text };
    }
    return { skipped: false as const, ok: true };
  } catch (error) {
    console.warn("[notification-center] Supabase mirror skipped", table, error);
    return { skipped: true as const, reason: "request-error" };
  }
}

async function deleteRows(table: string, filter: string) {
  const config = getSupabaseConfig();
  if (!config) return { skipped: true as const, reason: "missing-supabase-config" };

  try {
    const response = await fetch(`${config.url}/rest/v1/${table}?${filter}`, {
      method: "DELETE",
      headers: {
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
        prefer: "return=minimal",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn("[notification-center] Supabase mirror delete failed", table, response.status, text.slice(0, 500));
      return { skipped: false as const, ok: false, status: response.status, error: text };
    }
    return { skipped: false as const, ok: true };
  } catch (error) {
    console.warn("[notification-center] Supabase mirror delete skipped", table, error);
    return { skipped: true as const, reason: "request-error" };
  }
}

export async function mirrorNotificationEvent(event: {
  id: string;
  source: string;
  eventType: string;
  payload: string;
  createdAt: Date;
}) {
  return upsertRow("notification_events", {
    id: event.id,
    source: event.source,
    event_type: event.eventType,
    payload: parseJsonObject(event.payload),
    created_at: event.createdAt.toISOString(),
  });
}

export async function mirrorNotificationGroup(group: {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
}) {
  return upsertRow("notification_groups", {
    id: group.id,
    name: group.name,
    description: group.description,
    enabled: group.enabled,
  });
}

export async function mirrorNotification(notification: {
  id: string;
  eventId: string | null;
  groupId: string;
  title: string;
  summary: string | null;
  priority: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return upsertRow("notifications", {
    id: notification.id,
    event_id: notification.eventId,
    group_id: notification.groupId,
    title: notification.title,
    summary: notification.summary,
    priority: notification.priority,
    status: notification.status,
    created_at: notification.createdAt.toISOString(),
    updated_at: notification.updatedAt.toISOString(),
  });
}

export async function mirrorNotificationChannel(channel: {
  id: string;
  type: string;
  name: string;
  config: string;
  enabled: boolean;
  createdAt: Date;
}) {
  return upsertRow("notification_channels", {
    id: channel.id,
    type: channel.type,
    name: channel.name,
    config: parseJsonObject(channel.config),
    enabled: channel.enabled,
    created_at: channel.createdAt.toISOString(),
  });
}

export async function mirrorNotificationTemplate(template: {
  id: string;
  name: string;
  channelType: string;
  content: string;
  enabled: boolean;
}) {
  return upsertRow("notification_templates", {
    id: template.id,
    name: template.name,
    channel_type: template.channelType,
    content: template.content,
    enabled: template.enabled,
  });
}

export async function mirrorNotificationApiKey(apiKey: {
  id: string;
  name: string;
  apiKey: string;
  enabled: boolean;
  expiresAt: Date | null;
}) {
  return upsertRow("notification_api_keys", {
    id: apiKey.id,
    name: apiKey.name,
    api_key: apiKey.apiKey,
    enabled: apiKey.enabled,
    expires_at: toIso(apiKey.expiresAt),
  });
}

export async function mirrorQueueJob(job: {
  id: string;
  notificationId: string;
  channelId: string;
  templateId: string;
  priority: number;
  retryCount: number;
  maxRetry: number;
  status: string;
  nextExecuteAt: Date;
  lockedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return upsertRow("queue_jobs", {
    id: job.id,
    notification_id: job.notificationId,
    channel_id: job.channelId,
    template_id: job.templateId,
    priority: job.priority,
    retry_count: job.retryCount,
    max_retry: job.maxRetry,
    status: job.status,
    next_execute_at: job.nextExecuteAt.toISOString(),
    locked_at: toIso(job.lockedAt),
    last_error: job.lastError,
    created_at: job.createdAt.toISOString(),
    updated_at: job.updatedAt.toISOString(),
  });
}

export async function mirrorSendLog(log: {
  id: string;
  queueJobId: string;
  request: string;
  response: string;
  result: string;
  durationMs: number;
  createdAt: Date;
}) {
  return upsertRow("send_logs", {
    id: log.id,
    queue_job_id: log.queueJobId,
    request: parseJsonObject(log.request),
    response: parseJsonObject(log.response),
    result: log.result,
    duration_ms: log.durationMs,
    created_at: log.createdAt.toISOString(),
  });
}

export async function mirrorPushLedgerById(id: string) {
  const item = await prisma.pushLedger.findUnique({ where: { id } });
  if (!item) return { skipped: true as const, reason: "missing-ledger" };

  return upsertRow("push_ledgers", {
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
    queued_at: item.queuedAt.toISOString(),
    started_at: toIso(item.startedAt),
    sent_at: toIso(item.sentAt),
    failed_at: toIso(item.failedAt),
    last_retry_at: toIso(item.lastRetryAt),
    created_at: item.createdAt.toISOString(),
    updated_at: item.updatedAt.toISOString(),
  });
}

export async function mirrorPushLedgersByIds(ids: string[]) {
  for (const id of ids) {
    await mirrorPushLedgerById(id);
  }
}

export async function deleteSupabaseRowsById(table: string, ids: string[]) {
  for (const id of ids) {
    await deleteRows(table, `id=eq.${encodeURIComponent(id)}`);
  }
}

export function getBusinessField(payload: JsonObject, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

export function getLedgerTarget(channelType: string, config: JsonObject) {
  if (channelType === "Telegram") return typeof config.chatId === "string" ? config.chatId : null;
  if (channelType === "Webhook") return typeof config.url === "string" ? config.url : null;
  if (channelType === "Email") return typeof config.to === "string" ? config.to : null;
  return null;
}
