import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { parseJsonObject, stringifyJson } from "@/lib/notification-center/types";
import { createPushLedgerForJob, updatePushLedgerForJob } from "@/lib/notification-center/ledger";
import { renderTemplate } from "@/lib/notification-center/renderer";
import {
  mirrorNotification,
  mirrorNotificationApiKey,
  mirrorNotificationChannel,
  mirrorNotificationEvent,
  mirrorNotificationGroup,
  mirrorNotificationTemplate,
  mirrorPushLedgersByIds,
  mirrorQueueJob,
} from "@/lib/notification-center/supabase-mirror";

export function generateNotificationApiKey() {
  return `nc_${randomBytes(24).toString("base64url")}`;
}

export async function ensureNotificationDefaults() {
  const group = await prisma.notificationGroup.upsert({
    where: { name: "server" },
    update: {},
    create: { name: "server", description: "默认服务器通知分组", enabled: true },
  });
  await mirrorNotificationGroup(group);

  const telegramTemplate = await prisma.notificationTemplate.upsert({
    where: { id: "default-telegram-template" },
    update: {},
    create: {
      id: "default-telegram-template",
      name: "默认 Telegram 模板",
      channelType: "Telegram",
      content: "**{{title}}**\n\n{{summary}}\n\n事件：{{event_type}}\n来源：{{source}}\nPayload：{{payload}}",
      enabled: true,
    },
  });
  await mirrorNotificationTemplate(telegramTemplate);

  const webhookTemplate = await prisma.notificationTemplate.upsert({
    where: { id: "default-webhook-template" },
    update: {},
    create: {
      id: "default-webhook-template",
      name: "默认 Webhook 模板",
      channelType: "Webhook",
      content: "{{json}}",
      enabled: true,
    },
  });
  await mirrorNotificationTemplate(webhookTemplate);

  const existingKey = await prisma.notificationApiKey.findFirst({ where: { enabled: true } });
  if (existingKey) {
    await mirrorNotificationApiKey(existingKey);
  } else {
    const createdKey = await prisma.notificationApiKey.create({
      data: { name: "Default Worker Key", apiKey: generateNotificationApiKey(), enabled: true },
    });
    await mirrorNotificationApiKey(createdKey);
  }

  return group;
}

export async function validateNotificationApiKey(apiKey: string | null) {
  if (!apiKey) return null;
  const record = await prisma.notificationApiKey.findUnique({ where: { apiKey } });
  if (!record?.enabled) return null;
  if (record.expiresAt && record.expiresAt <= new Date()) return null;
  return record;
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

  const group = await prisma.notificationGroup.findFirst({ where: { name: input.group, enabled: true } });
  if (!group) {
    throw new Error(`通知分组不存在或已禁用：${input.group}`);
  }

  const source = input.source || "worker";
  const payload = normalizeNotificationPayload(input.payload, input.dedupeKey);
  if (input.dedupeKey) {
    const existingEvent = await prisma.notificationEvent.findFirst({
      where: {
        source,
        eventType: input.eventType,
        payload: { contains: `"dedupe_key":${JSON.stringify(input.dedupeKey)}` },
      },
      orderBy: { createdAt: "desc" },
      include: { notifications: { include: { jobs: true }, orderBy: { createdAt: "desc" }, take: 1 } },
    });
    const existingNotification = existingEvent?.notifications[0];
    if (existingNotification) {
      return { notification: existingNotification, duplicate: true };
    }
  }

  const event = await prisma.notificationEvent.create({
    data: {
      source,
      eventType: input.eventType,
      payload: stringifyJson(payload),
    },
  });
  await mirrorNotificationEvent(event);

  const notification = await prisma.notification.create({
    data: {
      eventId: event.id,
      groupId: group.id,
      title: input.title,
      summary: input.summary || null,
      priority: input.priority ?? 2,
      status: "Created",
    },
  });
  await mirrorNotification(notification);

  const channels = await prisma.notificationChannel.findMany({ where: { enabled: true }, orderBy: { createdAt: "asc" } });
  for (const channel of channels) {
    await mirrorNotificationChannel(channel);
  }
  const jobs = [];

  for (const channel of channels) {
    const template = await prisma.notificationTemplate.findFirst({
      where: { channelType: channel.type, enabled: true },
      orderBy: { name: "asc" },
    });
    if (!template) continue;
    await mirrorNotificationTemplate(template);
    jobs.push(
      prisma.queueJob.create({
        data: {
          notificationId: notification.id,
          channelId: channel.id,
          templateId: template.id,
          priority: input.priority ?? 2,
          status: "Pending",
          nextExecuteAt: new Date(),
        },
      }),
    );
  }

  if (jobs.length > 0) {
    const createdJobs = await prisma.$transaction(jobs);
    for (const job of createdJobs) {
      await mirrorQueueJob(job);
      const channel = channels.find((item) => item.id === job.channelId);
      if (!channel) continue;
      const template = await prisma.notificationTemplate.findUnique({ where: { id: job.templateId } });
      if (!template) continue;
      const payload = parseJsonObject(event.payload);
      const content = renderTemplate(template.content, {
        title: notification.title,
        summary: notification.summary ?? "",
        source: event.source,
        event_type: event.eventType,
        payload,
      });
      await createPushLedgerForJob({
        queueJobId: job.id,
        notificationId: notification.id,
        channelId: channel.id,
        channelType: channel.type,
        channelName: channel.name,
        channelConfig: channel.config,
        title: notification.title,
        content,
        rawPayload: payload,
      });
    }
    await refreshNotificationStatus(notification.id);
  }

  const createdNotification = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id }, include: { jobs: true } });
  return { notification: createdNotification, duplicate: false };
}

function normalizeNotificationPayload(payload: unknown, dedupeKey?: string | null) {
  if (!dedupeKey) return payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return { ...(payload as Record<string, unknown>), dedupe_key: dedupeKey };
  }
  return { value: payload, dedupe_key: dedupeKey };
}

export async function refreshNotificationStatus(notificationId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });
  if (!notification || notification.status === "Cancelled") return;

  const jobs = await prisma.queueJob.findMany({
    where: { notificationId },
    select: { status: true },
  });

  let status = "Created";
  if (jobs.length === 0) status = "Created";
  else if (jobs.every((job) => job.status === "Success")) status = "Completed";
  else if (jobs.every((job) => job.status === "DeadLetter")) status = "Failed";
  else if (jobs.some((job) => job.status === "Processing")) status = "Processing";
  else status = "Queued";

  if (status !== notification.status) {
    const updated = await prisma.notification.update({ where: { id: notificationId }, data: { status } });
    await mirrorNotification(updated);
  } else {
    await mirrorNotification(notification);
  }
}

export async function cancelNotification(id: string) {
  const affectedJobs = await prisma.queueJob.findMany({
    where: { notificationId: id, status: { in: ["Pending", "RetryWaiting"] } },
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.queueJob.updateMany({ where: { notificationId: id, status: { in: ["Pending", "RetryWaiting"] } }, data: { status: "DeadLetter", lastError: "Cancelled by user" } }),
    prisma.pushLedger.updateMany({ where: { notificationId: id, status: { in: ["Pending", "Processing", "RetryWaiting"] } }, data: { status: "Cancelled", error: "Cancelled by user" } }),
    prisma.notification.update({ where: { id }, data: { status: "Cancelled" } }),
  ]);

  const [notification, jobs, ledgers] = await Promise.all([
    prisma.notification.findUnique({ where: { id } }),
    prisma.queueJob.findMany({ where: { id: { in: affectedJobs.map((job) => job.id) } } }),
    prisma.pushLedger.findMany({ where: { notificationId: id }, select: { id: true } }),
  ]);
  if (notification) await mirrorNotification(notification);
  for (const job of jobs) await mirrorQueueJob(job);
  await mirrorPushLedgersByIds(ledgers.map((ledger) => ledger.id));
}

export async function retryQueueJob(id: string) {
  const job = await prisma.queueJob.update({
    where: { id },
    data: { status: "Pending", nextExecuteAt: new Date(), lockedAt: null, lastError: null },
  });
  await mirrorQueueJob(job);
  await updatePushLedgerForJob(job.id, "Pending", { error: null, retryCount: job.retryCount });
  await refreshNotificationStatus(job.notificationId);
  return job;
}

export function serializeNotification(notification: {
  id: string;
  status: string;
  title: string;
  summary: string | null;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  group?: { name: string } | null;
  event?: { source: string; eventType: string; payload: string } | null;
}) {
  return {
    id: notification.id,
    status: notification.status,
    title: notification.title,
    summary: notification.summary,
    priority: notification.priority,
    group: notification.group?.name ?? null,
    source: notification.event?.source ?? null,
    event_type: notification.event?.eventType ?? null,
    payload: notification.event ? parseJsonObject(notification.event.payload) : null,
    created_at: notification.createdAt.toISOString(),
    updated_at: notification.updatedAt.toISOString(),
  };
}
