import { prisma } from "@/lib/prisma";
import { ensureNotificationDefaults } from "@/lib/notification-center/manager";
import { createPushLedgerForJob } from "@/lib/notification-center/ledger";
import { renderTemplate } from "@/lib/notification-center/renderer";
import { parseJsonObject } from "@/lib/notification-center/types";
import {
  mirrorNotification,
  mirrorNotificationApiKey,
  mirrorNotificationChannel,
  mirrorNotificationEvent,
  mirrorNotificationGroup,
  mirrorNotificationTemplate,
  mirrorPushLedgerById,
  mirrorQueueJob,
  mirrorSendLog,
} from "@/lib/notification-center/supabase-mirror";

async function backfillPushLedgers() {
  const jobs = await prisma.queueJob.findMany({
    where: { pushLedger: null },
    include: {
      channel: true,
      template: true,
      notification: { include: { event: true } },
    },
  });

  for (const job of jobs) {
    const payload = parseJsonObject(job.notification.event?.payload);
    const content = renderTemplate(job.template.content, {
      title: job.notification.title,
      summary: job.notification.summary ?? "",
      source: job.notification.event?.source ?? "retained-event-deleted",
      event_type: job.notification.event?.eventType ?? "unknown",
      payload,
    });
    await createPushLedgerForJob({
      queueJobId: job.id,
      notificationId: job.notificationId,
      channelId: job.channelId,
      channelType: job.channel.type,
      channelName: job.channel.name,
      channelConfig: job.channel.config,
      title: job.notification.title,
      content,
      rawPayload: payload,
    });
  }

  return jobs.length;
}

async function main() {
  await ensureNotificationDefaults();
  const backfilledLedgers = await backfillPushLedgers();

  const [groups, templates, channels, apiKeys, events, notifications, jobs, logs, ledgers] = await Promise.all([
    prisma.notificationGroup.findMany(),
    prisma.notificationTemplate.findMany(),
    prisma.notificationChannel.findMany(),
    prisma.notificationApiKey.findMany(),
    prisma.notificationEvent.findMany(),
    prisma.notification.findMany(),
    prisma.queueJob.findMany(),
    prisma.sendLog.findMany(),
    prisma.pushLedger.findMany({ select: { id: true } }),
  ]);

  for (const item of groups) await mirrorNotificationGroup(item);
  for (const item of templates) await mirrorNotificationTemplate(item);
  for (const item of channels) await mirrorNotificationChannel(item);
  for (const item of apiKeys) await mirrorNotificationApiKey(item);
  for (const item of events) await mirrorNotificationEvent(item);
  for (const item of notifications) await mirrorNotification(item);
  for (const item of jobs) await mirrorQueueJob(item);
  for (const item of logs) await mirrorSendLog(item);
  for (const item of ledgers) await mirrorPushLedgerById(item.id);

  console.log(JSON.stringify({
    backfilledLedgers,
    groups: groups.length,
    templates: templates.length,
    channels: channels.length,
    apiKeys: apiKeys.length,
    events: events.length,
    notifications: notifications.length,
    jobs: jobs.length,
    logs: logs.length,
    ledgers: ledgers.length,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
