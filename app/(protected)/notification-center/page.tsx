import { NotificationCenterDashboard } from "@/components/notification-center/dashboard";
import { prisma } from "@/lib/prisma";
import { ensureNotificationDefaults } from "@/lib/notification-center/manager";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await ensureNotificationDefaults();

  const [notifications, pendingJobs, failedJobs, channels, apiKeys, groups, templates] = await Promise.all([
    prisma.notification.findMany({ include: { group: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.queueJob.count({ where: { status: { in: ["Pending", "RetryWaiting"] } } }),
    prisma.queueJob.count({ where: { status: "DeadLetter" } }),
    prisma.notificationChannel.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.notificationApiKey.findMany({ orderBy: { id: "desc" }, take: 20 }),
    prisma.notificationGroup.findMany({ orderBy: { name: "asc" } }),
    prisma.notificationTemplate.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <NotificationCenterDashboard
      stats={{ notifications: notifications.length, pendingJobs, failedJobs, channels: channels.filter((c) => c.enabled).length }}
      apiKeys={apiKeys.map((item) => ({ id: item.id, name: item.name, apiKey: item.apiKey, enabled: item.enabled }))}
      groups={groups.map((item) => ({ id: item.id, name: item.name, description: item.description, enabled: item.enabled }))}
      channels={channels.map((item) => ({ id: item.id, name: item.name, type: item.type, config: item.config, enabled: item.enabled }))}
      templates={templates.map((item) => ({ id: item.id, name: item.name, channelType: item.channelType, content: item.content, enabled: item.enabled }))}
      notifications={notifications.map((item) => ({ id: item.id, title: item.title, status: item.status, createdAt: item.createdAt.toISOString(), group: item.group.name }))}
    />
  );
}
