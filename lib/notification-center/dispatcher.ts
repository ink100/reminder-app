import { appSettingStore } from "@/lib/app-settings/store";
import { canSendMail, createMailTransport, getMailFrom } from "@/lib/mailer";
import { resolveTelegramBotToken, sendTelegramMessage } from "@/lib/telegram-bot";
import { refreshNotificationStatus } from "@/lib/notification-center/manager";
import { createPushLedgerForJob, updatePushLedgerForJob } from "@/lib/notification-center/ledger";
import { renderTemplate } from "@/lib/notification-center/renderer";
import { parseJsonObject, RETRY_DELAYS_MS } from "@/lib/notification-center/types";
import {
  channelConfigString,
  deleteRows,
  eq,
  insertRow,
  lt,
  lte,
  newId,
  NotificationChannelRow,
  NotificationEventRow,
  NotificationRow,
  NotificationTemplateRow,
  QueueJobRow,
  selectOne,
  selectRows,
  SendLogRow,
  updateRows,
} from "@/lib/notification-center/store";

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

type LoadedJob = QueueJobRow & {
  channel: NotificationChannelRow;
  template: NotificationTemplateRow;
  notification: NotificationRow & { event: NotificationEventRow | null };
};

async function loadJob(jobId: string): Promise<LoadedJob> {
  const job = await selectOne<QueueJobRow>("queue_jobs", { filters: { id: eq(jobId) } });
  if (!job) throw new Error("Queue job not found");
  const [channel, template, notification] = await Promise.all([
    selectOne<NotificationChannelRow>("notification_channels", { filters: { id: eq(job.channel_id) } }),
    selectOne<NotificationTemplateRow>("notification_templates", { filters: { id: eq(job.template_id) } }),
    selectOne<NotificationRow>("notifications", { filters: { id: eq(job.notification_id) } }),
  ]);
  if (!channel || !template || !notification) throw new Error("Queue job relation missing");
  const event = notification.event_id ? await selectOne<NotificationEventRow>("notification_events", { filters: { id: eq(notification.event_id) } }) : null;
  return { ...job, channel, template, notification: { ...notification, event } };
}

async function dispatchOne(jobId: string) {
  const now = new Date();
  const lockedRows = await updateRows<QueueJobRow>("queue_jobs", {
    id: eq(jobId),
    status: "in.(\"Pending\",\"RetryWaiting\")",
    next_execute_at: lte(now),
  }, {
    status: "Processing",
    locked_at: now.toISOString(),
    last_error: null,
    updated_at: now.toISOString(),
  });

  if (lockedRows.length === 0) return { skipped: true };

  const job = await loadJob(jobId);
  await refreshNotificationStatus(job.notification_id);

  const started = Date.now();
  const payload = job.notification.event?.payload ?? {};
  const message = renderTemplate(job.template.content, {
    title: job.notification.title,
    summary: job.notification.summary ?? "",
    source: job.notification.event?.source ?? "retained-event-deleted",
    event_type: job.notification.event?.event_type ?? "unknown",
    payload,
  });
  const config = job.channel.config ?? {};

  await createPushLedgerForJob({
    queueJobId: job.id,
    notificationId: job.notification_id,
    channelId: job.channel_id,
    channelType: job.channel.type,
    channelName: job.channel.name,
    channelConfig: channelConfigString(job.channel),
    title: job.notification.title,
    content: message,
    rawPayload: payload,
  });
  await updatePushLedgerForJob(job.id, "Processing", {
    request: { channel: job.channel.type, message },
    retryCount: job.retry_count,
    attemptIncrement: true,
  });

  try {
    let responsePayload: unknown = {};
    if (job.channel.type === "Telegram") {
      const settings = await appSettingStore.findUnique({ where: { id: 1 } });
      const token = typeof config.token === "string" ? config.token : settings ? resolveTelegramBotToken(settings) : null;
      const chatId = typeof config.chatId === "string" ? config.chatId : settings?.telegramBotChatId;
      if (!token || !chatId) throw new Error("Telegram channel missing token/chatId");
      responsePayload = await sendTelegramMessage({ token, chatId, text: message });
    } else if (job.channel.type === "Email") {
      const settings = await appSettingStore.findUnique({ where: { id: 1 } });
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

    const sendLog = await insertRow<SendLogRow>("send_logs", {
      id: newId("sl"),
      queue_job_id: job.id,
      request: { channel: job.channel.type, message },
      response: parseJsonObject(JSON.stringify(responsePayload)),
      result: "success",
      duration_ms: Date.now() - started,
    });
    void sendLog;
    await updateRows<QueueJobRow>("queue_jobs", { id: eq(job.id) }, {
      status: "Success",
      locked_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    });
    await updatePushLedgerForJob(job.id, "Success", {
      response: responsePayload,
      error: null,
      durationMs: Date.now() - started,
      retryCount: job.retry_count,
    });
    await refreshNotificationStatus(job.notification_id);
    return { success: true };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    const retryCount = job.retry_count + 1;
    const dead = retryCount > job.max_retry;
    const delay = RETRY_DELAYS_MS[Math.min(retryCount - 1, RETRY_DELAYS_MS.length - 1)];

    await insertRow<SendLogRow>("send_logs", {
      id: newId("sl"),
      queue_job_id: job.id,
      request: { channel: job.channel.type, message },
      response: { error: messageText },
      result: "failed",
      duration_ms: Date.now() - started,
    });
    await updateRows<QueueJobRow>("queue_jobs", { id: eq(job.id) }, {
      status: dead ? "DeadLetter" : "RetryWaiting",
      retry_count: retryCount,
      next_execute_at: dead ? job.next_execute_at : new Date(Date.now() + delay).toISOString(),
      locked_at: null,
      last_error: messageText,
      updated_at: new Date().toISOString(),
    });
    await updatePushLedgerForJob(job.id, dead ? "DeadLetter" : "RetryWaiting", {
      response: { error: messageText },
      error: messageText,
      durationMs: Date.now() - started,
      retryCount,
    });
    await refreshNotificationStatus(job.notification_id);
    if (dead) throw error;
    return { retry: true, error: messageText };
  }
}

export async function dispatchQueueJobs(limit = 10) {
  const jobs = await selectRows<QueueJobRow>("queue_jobs", {
    filters: { status: "in.(\"Pending\",\"RetryWaiting\")", next_execute_at: lte(new Date()) },
    order: "priority.asc,next_execute_at.asc",
    limit,
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
    selectRows<SendLogRow>("send_logs", { filters: { created_at: lt(days(30)) }, limit: 1000 }),
    selectRows<QueueJobRow>("queue_jobs", { filters: { created_at: lt(days(30)) }, limit: 1000 }),
    selectRows<NotificationEventRow>("notification_events", { filters: { created_at: lt(days(14)) }, limit: 1000 }),
  ]);
  for (const item of oldLogs) await deleteRows("send_logs", { id: eq(item.id) });
  for (const item of oldJobs) await deleteRows("queue_jobs", { id: eq(item.id) });
  for (const item of oldEvents) await deleteRows("notification_events", { id: eq(item.id) });
  return { events: oldEvents.length, queue_jobs: oldJobs.length, send_logs: oldLogs.length };
}
