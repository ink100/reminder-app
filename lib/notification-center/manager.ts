import { randomBytes } from "node:crypto";

import { parseJsonObject, stringifyJson } from "@/lib/notification-center/types";
import { createPushLedgerForJob, updatePushLedgerForJob } from "@/lib/notification-center/ledger";
import { renderTemplate } from "@/lib/notification-center/renderer";
import {
  eq,
  ilikeContains,
  inList,
  insertRow,
  newId,
  NotificationApiKeyRow,
  NotificationChannelRow,
  NotificationEventRow,
  NotificationGroupRouteRow,
  NotificationGroupRow,
  NotificationRow,
  NotificationTemplateRow,
  QueueJobRow,
  selectOne,
  selectRows,
  updateRows,
} from "@/lib/notification-center/store";
import { resolveEffectiveGroupRoutes } from "@/lib/notification-center/routing";

export type NotificationWithContext = NotificationRow & {
  group?: NotificationGroupRow | null;
  event?: NotificationEventRow | null;
};

export function generateNotificationApiKey() {
  return `nc_${randomBytes(24).toString("base64url")}`;
}

export async function ensureNotificationDefaults() {
  const existingGroup = await selectOne<NotificationGroupRow>("notification_groups", { filters: { name: eq("server") } });
  const group = existingGroup ?? await insertRow<NotificationGroupRow>("notification_groups", {
    id: "default-server-group",
    name: "server",
    description: "默认服务器通知分组",
    enabled: true,
  });

  const defaultTemplates = [
    {
      id: "default-telegram-template",
      name: "默认 Telegram 模板",
      channel_type: "Telegram",
      content: "**{{title}}**\n\n{{summary}}\n\n事件：{{event_type}}\n来源：{{source}}\nPayload：{{payload}}",
    },
    {
      id: "default-webhook-template",
      name: "默认 Webhook 模板",
      channel_type: "Webhook",
      content: "{{json}}",
    },
  ];
  for (const template of defaultTemplates) {
    const existing = await selectOne<NotificationTemplateRow>("notification_templates", { filters: { id: eq(template.id) } });
    if (!existing) {
      const configuredDefault = await selectOne<NotificationTemplateRow>("notification_templates", {
        filters: { channel_type: eq(template.channel_type), group_id: "is.null", is_default: eq(true) },
      });
      await insertRow<NotificationTemplateRow>("notification_templates", {
        ...template,
        enabled: true,
        group_id: null,
        is_default: !configuredDefault,
      });
    }
  }

  return group;
}

export async function validateNotificationApiKey(apiKey: string | null) {
  if (!apiKey) return null;
  const record = await selectOne<NotificationApiKeyRow>("notification_api_keys", { filters: { api_key: eq(apiKey) } });
  if (!record?.enabled) return null;
  if (record.expires_at && new Date(record.expires_at) <= new Date()) return null;
  return record;
}

export const NOTIFICATION_SEND_SCOPE = "notifications:send";
export const AI_ALL_SCOPE = "ai:all";

/** Missing scopes are deliberately treated as the legacy notification-only default; malformed scopes grant nothing. */
export function notificationApiKeyScopes(record: { scopes?: unknown }): string[] {
  if (record.scopes === undefined || record.scopes === null) return [NOTIFICATION_SEND_SCOPE];
  if (!Array.isArray(record.scopes) || !record.scopes.every(
    (scope) => scope === NOTIFICATION_SEND_SCOPE || scope === AI_ALL_SCOPE,
  )) return [];
  return record.scopes;
}

export async function createNotificationFromEvent(input: {
  source?: string;
  group: string;
  eventType: string;
  title: string;
  summary?: string | null;
  dedupeKey?: string | null;
  payload: unknown;
  priority?: number;
}) {
  await ensureNotificationDefaults();

  const group = await selectOne<NotificationGroupRow>("notification_groups", {
    filters: { name: eq(input.group), enabled: eq(true) },
  });
  if (!group) throw new Error(`通知分组不存在或已禁用：${input.group}`);

  const source = input.source || "worker";
  const payload = normalizeNotificationPayload(input.payload, input.dedupeKey);
  if (input.dedupeKey) {
    const existingEvents = await selectRows<NotificationEventRow>("notification_events", {
      filters: { source: eq(source), event_type: eq(input.eventType), payload: `cs.{"dedupe_key":"${input.dedupeKey.replaceAll('"', '\\"')}"}` },
      order: "created_at.desc",
      limit: 1,
    });
    const existingEvent = existingEvents[0];
    if (existingEvent) {
      const existingNotification = await selectOne<NotificationRow>("notifications", {
        filters: { event_id: eq(existingEvent.id) },
        order: "created_at.desc",
      });
      if (existingNotification) {
        const jobs = await selectRows<QueueJobRow>("queue_jobs", { filters: { notification_id: eq(existingNotification.id) } });
        return { notification: { ...existingNotification, jobs }, duplicate: true };
      }
    }
  }

  const event = await insertRow<NotificationEventRow>("notification_events", {
    id: newId("nev"),
    source,
    event_type: input.eventType,
    payload,
  });

  const notification = await insertRow<NotificationRow>("notifications", {
    id: newId("not"),
    event_id: event.id,
    group_id: group.id,
    title: input.title,
    summary: input.summary || null,
    priority: input.priority ?? 2,
    status: "Created",
  });

  const [channels, templates, groupRoutes] = await Promise.all([
    selectRows<NotificationChannelRow>("notification_channels", { order: "created_at.asc" }),
    selectRows<NotificationTemplateRow>("notification_templates", { order: "name.asc" }),
    selectRows<NotificationGroupRouteRow>("notification_group_routes", { filters: { group_id: eq(group.id) } }),
  ]);
  const effectiveRoutes = resolveEffectiveGroupRoutes({ groupId: group.id, channels, templates, routes: groupRoutes });

  const createdJobs: QueueJobRow[] = [];
  for (const route of effectiveRoutes.filter((item) => item.enabled && item.template)) {
    const channel = route.channel;
    const template = route.template!;
    const content = renderTemplate(template.content, {
      title: notification.title,
      summary: notification.summary ?? "",
      source: event.source,
      event_type: event.event_type,
      payload: event.payload,
    });
    const job = await insertRow<QueueJobRow>("queue_jobs", {
      id: newId("qj"),
      notification_id: notification.id,
      channel_id: channel.id,
      template_id: template.id,
      channel_config: route.config,
      rendered_content: content,
      priority: input.priority ?? 2,
      status: "Pending",
      next_execute_at: new Date().toISOString(),
    });
    createdJobs.push(job);

    await createPushLedgerForJob({
      queueJobId: job.id,
      notificationId: notification.id,
      channelId: channel.id,
      channelType: channel.type,
      channelName: channel.name,
      channelConfig: stringifyJson(route.config),
      title: notification.title,
      content,
      rawPayload: event.payload,
    });
  }

  if (createdJobs.length > 0) await refreshNotificationStatus(notification.id);
  const createdNotification = await getNotificationWithJobs(notification.id);
  return { notification: createdNotification ?? { ...notification, jobs: createdJobs }, duplicate: false };
}

function normalizeNotificationPayload(payload: unknown, dedupeKey?: string | null) {
  if (!dedupeKey) return payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return { ...(payload as Record<string, unknown>), dedupe_key: dedupeKey };
  }
  return { value: payload, dedupe_key: dedupeKey };
}

export async function refreshNotificationStatus(notificationId: string) {
  const notification = await selectOne<NotificationRow>("notifications", { filters: { id: eq(notificationId) } });
  if (!notification || notification.status === "Cancelled") return;

  const jobs = await selectRows<QueueJobRow>("queue_jobs", { filters: { notification_id: eq(notificationId) } });
  let status = "Created";
  if (jobs.length === 0) status = "Created";
  else if (jobs.every((job) => job.status === "Success")) status = "Completed";
  else if (jobs.every((job) => job.status === "DeadLetter")) status = "Failed";
  else if (jobs.some((job) => job.status === "Processing")) status = "Processing";
  else status = "Queued";

  if (status !== notification.status) {
    await updateRows<NotificationRow>("notifications", { id: eq(notificationId) }, { status, updated_at: new Date().toISOString() });
  }
}

export async function cancelNotification(id: string) {
  const affectedJobs = await selectRows<QueueJobRow>("queue_jobs", {
    filters: { notification_id: eq(id), status: inList(["Pending", "RetryWaiting"]) },
  });
  await updateRows<QueueJobRow>("queue_jobs", { notification_id: eq(id), status: inList(["Pending", "RetryWaiting"]) }, {
    status: "DeadLetter",
    last_error: "Cancelled by user",
    updated_at: new Date().toISOString(),
  });
  await updateRows("push_ledgers", { notification_id: eq(id), status: inList(["Pending", "Processing", "RetryWaiting"]) }, {
    status: "Cancelled",
    error: "Cancelled by user",
    updated_at: new Date().toISOString(),
  });
  await updateRows<NotificationRow>("notifications", { id: eq(id) }, { status: "Cancelled", updated_at: new Date().toISOString() });
  return { affectedJobs: affectedJobs.length };
}

export async function retryQueueJob(id: string) {
  const rows = await updateRows<QueueJobRow>("queue_jobs", { id: eq(id) }, {
    status: "Pending",
    next_execute_at: new Date().toISOString(),
    locked_at: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  });
  const job = rows[0];
  if (!job) throw new Error("Queue job not found");
  await updatePushLedgerForJob(job.id, "Pending", { error: null, retryCount: job.retry_count });
  await refreshNotificationStatus(job.notification_id);
  return job;
}

export async function getNotificationWithContext(id: string): Promise<NotificationWithContext | null> {
  const notification = await selectOne<NotificationRow>("notifications", { filters: { id: eq(id) } });
  if (!notification) return null;
  const [group, event] = await Promise.all([
    selectOne<NotificationGroupRow>("notification_groups", { filters: { id: eq(notification.group_id) } }),
    notification.event_id ? selectOne<NotificationEventRow>("notification_events", { filters: { id: eq(notification.event_id) } }) : Promise.resolve(null),
  ]);
  return { ...notification, group, event };
}

export async function getNotificationWithJobs(id: string) {
  const notification = await getNotificationWithContext(id);
  if (!notification) return null;
  const jobs = await selectRows<QueueJobRow>("queue_jobs", { filters: { notification_id: eq(id) }, order: "created_at.desc" });
  return { ...notification, jobs };
}

export async function listNotifications(input: { status?: string; group?: string; limit: number; offset: number }) {
  const filters: Record<string, string> = {};
  if (input.status) filters.status = eq(input.status);
  if (input.group) {
    const group = await selectOne<NotificationGroupRow>("notification_groups", { filters: { name: eq(input.group) } });
    if (!group) return [];
    filters.group_id = eq(group.id);
  }
  const notifications = await selectRows<NotificationRow>("notifications", {
    filters,
    order: "created_at.desc",
    limit: input.limit,
    offset: input.offset,
  });
  const groupIds = [...new Set(notifications.map((item) => item.group_id))];
  const eventIds = [...new Set(notifications.map((item) => item.event_id).filter((id): id is string => Boolean(id)))];
  const [groups, events] = await Promise.all([
    groupIds.length ? selectRows<NotificationGroupRow>("notification_groups", { filters: { id: inList(groupIds) } }) : Promise.resolve([]),
    eventIds.length ? selectRows<NotificationEventRow>("notification_events", { filters: { id: inList(eventIds) } }) : Promise.resolve([]),
  ]);
  return notifications.map((notification) => ({
    ...notification,
    group: groups.find((group) => group.id === notification.group_id) ?? null,
    event: events.find((event) => event.id === notification.event_id) ?? null,
  }));
}

export function serializeNotification(notification: NotificationWithContext) {
  return {
    id: notification.id,
    status: notification.status,
    title: notification.title,
    summary: notification.summary,
    priority: notification.priority,
    group: notification.group?.name ?? null,
    source: notification.event?.source ?? null,
    event_type: notification.event?.event_type ?? null,
    payload: notification.event ? parseJsonObject(stringifyJson(notification.event.payload)) : null,
    created_at: new Date(notification.created_at).toISOString(),
    updated_at: new Date(notification.updated_at).toISOString(),
  };
}

export function serializeJob(job: QueueJobRow & { channel?: NotificationChannelRow | null; notification?: NotificationRow | null }) {
  return {
    id: job.id,
    notification_id: job.notification_id,
    notification_title: job.notification?.title ?? "",
    channel: job.channel?.name ?? "",
    type: job.channel?.type ?? "",
    status: job.status,
    retry_count: job.retry_count,
    max_retry: job.max_retry,
    next_execute_at: new Date(job.next_execute_at).toISOString(),
    last_error: job.last_error,
  };
}

export function notificationPayloadContainsQuery(q: string) {
  const safe = q.replace(/[(),]/g, " ");
  return `title.${ilikeContains(safe)},content.${ilikeContains(safe)},target.${ilikeContains(safe)},business_id.${ilikeContains(safe)},error.${ilikeContains(safe)}`;
}
