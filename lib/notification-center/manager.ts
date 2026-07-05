import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { parseJsonObject, stringifyJson } from "@/lib/notification-center/types";

export function generateNotificationApiKey() {
  return `nc_${randomBytes(24).toString("base64url")}`;
}

export async function ensureNotificationDefaults() {
  const group = await prisma.notificationGroup.upsert({
    where: { name: "server" },
    update: {},
    create: { name: "server", description: "默认服务器通知分组", enabled: true },
  });

  await prisma.notificationTemplate.upsert({
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

  await prisma.notificationTemplate.upsert({
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

  const existingKey = await prisma.notificationApiKey.findFirst({ where: { enabled: true } });
  if (!existingKey) {
    await prisma.notificationApiKey.create({
      data: { name: "Default Worker Key", apiKey: generateNotificationApiKey(), enabled: true },
    });
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
  payload: unknown;
  priority?: number;
}) {
  await ensureNotificationDefaults();

  const group = await prisma.notificationGroup.findFirst({ where: { name: input.group, enabled: true } });
  if (!group) {
    throw new Error(`通知分组不存在或已禁用：${input.group}`);
  }

  const event = await prisma.notificationEvent.create({
    data: {
      source: input.source || "worker",
      eventType: input.eventType,
      payload: stringifyJson(input.payload),
    },
  });

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

  const channels = await prisma.notificationChannel.findMany({ where: { enabled: true }, orderBy: { createdAt: "asc" } });
  const jobs = [];

  for (const channel of channels) {
    const template = await prisma.notificationTemplate.findFirst({
      where: { channelType: channel.type, enabled: true },
      orderBy: { name: "asc" },
    });
    if (!template) continue;
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
    await prisma.$transaction(jobs);
    await refreshNotificationStatus(notification.id);
  }

  return prisma.notification.findUniqueOrThrow({ where: { id: notification.id }, include: { jobs: true } });
}

export async function refreshNotificationStatus(notificationId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { status: true },
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
    await prisma.notification.update({ where: { id: notificationId }, data: { status } });
  }
}

export async function cancelNotification(id: string) {
  await prisma.$transaction([
    prisma.queueJob.updateMany({ where: { notificationId: id, status: { in: ["Pending", "RetryWaiting"] } }, data: { status: "DeadLetter", lastError: "Cancelled by user" } }),
    prisma.notification.update({ where: { id }, data: { status: "Cancelled" } }),
  ]);
}

export async function retryQueueJob(id: string) {
  const job = await prisma.queueJob.update({
    where: { id },
    data: { status: "Pending", nextExecuteAt: new Date(), lockedAt: null, lastError: null },
  });
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
