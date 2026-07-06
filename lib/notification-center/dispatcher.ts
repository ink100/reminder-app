import { prisma } from "@/lib/prisma";
import { canSendMail, createMailTransport, getMailFrom } from "@/lib/mailer";
import { resolveTelegramBotToken, sendTelegramMessage } from "@/lib/telegram-bot";
import { refreshNotificationStatus } from "@/lib/notification-center/manager";
import { createPushLedgerForJob, updatePushLedgerForJob } from "@/lib/notification-center/ledger";
import { renderTemplate } from "@/lib/notification-center/renderer";
import { parseJsonObject, RETRY_DELAYS_MS, stringifyJson } from "@/lib/notification-center/types";
import { deleteSupabaseRowsById, mirrorQueueJob, mirrorSendLog } from "@/lib/notification-center/supabase-mirror";

async function sendWebhook(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Webhook HTTP ${response.status}: ${text.slice(0, 300)}`);
  return { status: response.status, body: text.slice(0, 1000) };
}

async function dispatchOne(jobId: string) {
  const locked = await prisma.queueJob.updateMany({
    where: { id: jobId, status: { in: ["Pending", "RetryWaiting"] }, nextExecuteAt: { lte: new Date() } },
    data: { status: "Processing", lockedAt: new Date(), lastError: null },
  });

  if (locked.count === 0) return { skipped: true };

  const job = await prisma.queueJob.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      channel: true,
      template: true,
      notification: { include: { event: true } },
    },
  });
  await mirrorQueueJob(job);

  await refreshNotificationStatus(job.notificationId);

  const started = Date.now();
  const payload = parseJsonObject(job.notification.event?.payload);
  const message = renderTemplate(job.template.content, {
    title: job.notification.title,
    summary: job.notification.summary ?? "",
    source: job.notification.event?.source ?? "retained-event-deleted",
    event_type: job.notification.event?.eventType ?? "unknown",
    payload,
  });
  const config = parseJsonObject(job.channel.config);

  await createPushLedgerForJob({
    queueJobId: job.id,
    notificationId: job.notificationId,
    channelId: job.channelId,
    channelType: job.channel.type,
    channelName: job.channel.name,
    channelConfig: job.channel.config,
    title: job.notification.title,
    content: message,
    rawPayload: payload,
  });
  await updatePushLedgerForJob(job.id, "Processing", {
    request: { channel: job.channel.type, message },
    retryCount: job.retryCount,
    attemptIncrement: true,
  });

  try {
    let responsePayload: unknown = {};
    if (job.channel.type === "Telegram") {
      const settings = await prisma.appSetting.findUnique({ where: { id: 1 } });
      const token = typeof config.token === "string" ? config.token : settings ? resolveTelegramBotToken(settings) : null;
      const chatId = typeof config.chatId === "string" ? config.chatId : settings?.telegramBotChatId;
      if (!token || !chatId) throw new Error("Telegram channel missing token/chatId");
      responsePayload = await sendTelegramMessage({ token, chatId, text: message });
    } else if (job.channel.type === "Email") {
      const settings = await prisma.appSetting.findUnique({ where: { id: 1 } });
      if (!settings || !settings.notificationEmail || !canSendMail(settings)) throw new Error("Email channel is not configured");
      const transport = createMailTransport(settings);
      responsePayload = await transport.sendMail({ from: getMailFrom(settings), to: settings.notificationEmail, subject: job.notification.title, text: message });
    } else if (job.channel.type === "Webhook") {
      const url = typeof config.url === "string" ? config.url : "";
      if (!url) throw new Error("Webhook channel missing url");
      responsePayload = await sendWebhook(url, message);
    } else {
      throw new Error(`Unsupported channel type: ${job.channel.type}`);
    }

    const [sendLog, updatedJob] = await prisma.$transaction([
      prisma.sendLog.create({
        data: {
          queueJobId: job.id,
          request: stringifyJson({ channel: job.channel.type, message }),
          response: stringifyJson(responsePayload),
          result: "success",
          durationMs: Date.now() - started,
        },
      }),
      prisma.queueJob.update({ where: { id: job.id }, data: { status: "Success", lockedAt: null, lastError: null } }),
    ]);
    await mirrorSendLog(sendLog);
    await mirrorQueueJob(updatedJob);
    await updatePushLedgerForJob(job.id, "Success", {
      response: responsePayload,
      error: null,
      durationMs: Date.now() - started,
      retryCount: job.retryCount,
    });
    await refreshNotificationStatus(job.notificationId);
    return { success: true };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    const retryCount = job.retryCount + 1;
    const dead = retryCount > job.maxRetry;
    const delay = RETRY_DELAYS_MS[Math.min(retryCount - 1, RETRY_DELAYS_MS.length - 1)];

    const [sendLog, updatedJob] = await prisma.$transaction([
      prisma.sendLog.create({
        data: {
          queueJobId: job.id,
          request: stringifyJson({ channel: job.channel.type, message }),
          response: stringifyJson({ error: messageText }),
          result: "failed",
          durationMs: Date.now() - started,
        },
      }),
      prisma.queueJob.update({
        where: { id: job.id },
        data: {
          status: dead ? "DeadLetter" : "RetryWaiting",
          retryCount,
          nextExecuteAt: dead ? job.nextExecuteAt : new Date(Date.now() + delay),
          lockedAt: null,
          lastError: messageText,
        },
      }),
    ]);
    await mirrorSendLog(sendLog);
    await mirrorQueueJob(updatedJob);
    await updatePushLedgerForJob(job.id, dead ? "DeadLetter" : "RetryWaiting", {
      response: { error: messageText },
      error: messageText,
      durationMs: Date.now() - started,
      retryCount,
    });
    await refreshNotificationStatus(job.notificationId);
    if (dead) throw error;
    return { retry: true, error: messageText };
  }
}

export async function dispatchQueueJobs(limit = 10) {
  const jobs = await prisma.queueJob.findMany({
    where: { status: { in: ["Pending", "RetryWaiting"] }, nextExecuteAt: { lte: new Date() } },
    orderBy: [{ priority: "asc" }, { nextExecuteAt: "asc" }],
    take: limit,
  });

  let processed = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const result = await dispatchOne(job.id);
      if (!result.skipped) processed += 1;
    } catch (error) {
      failed += 1;
      console.error("[notification-center] queue job failed", job.id, error);
    }
  }
  return { scanned: jobs.length, processed, failed };
}

export async function cleanupNotificationData(now = new Date()) {
  const days = (value: number) => new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
  const [oldLogs, oldJobs, oldEvents] = await Promise.all([
    prisma.sendLog.findMany({ where: { createdAt: { lt: days(30) } }, select: { id: true } }),
    prisma.queueJob.findMany({ where: { createdAt: { lt: days(30) } }, select: { id: true } }),
    prisma.notificationEvent.findMany({ where: { createdAt: { lt: days(14) } }, select: { id: true } }),
  ]);
  const [logs, jobs, events] = await prisma.$transaction([
    prisma.sendLog.deleteMany({ where: { id: { in: oldLogs.map((item) => item.id) } } }),
    prisma.queueJob.deleteMany({ where: { id: { in: oldJobs.map((item) => item.id) } } }),
    prisma.notificationEvent.deleteMany({ where: { id: { in: oldEvents.map((item) => item.id) } } }),
  ]);
  await deleteSupabaseRowsById("send_logs", oldLogs.map((item) => item.id));
  await deleteSupabaseRowsById("queue_jobs", oldJobs.map((item) => item.id));
  await deleteSupabaseRowsById("notification_events", oldEvents.map((item) => item.id));
  return { events: events.count, queue_jobs: jobs.count, send_logs: logs.count };
}
