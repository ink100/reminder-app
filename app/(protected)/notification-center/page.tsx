import { NotificationCenterDashboard } from "@/components/notification-center/dashboard";
import { ensureNotificationDefaults, listNotifications } from "@/lib/notification-center/manager";
import { countRows, eq, NotificationApiKeyRow, NotificationChannelRow, NotificationGroupRow, NotificationTemplateRow, selectRows } from "@/lib/notification-center/store";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await ensureNotificationDefaults();

  const [notifications, pendingJobs, failedJobs, channels, apiKeys, groups, templates] = await Promise.all([
    listNotifications({ limit: 20, offset: 0 }),
    countRows("queue_jobs", { filters: { status: "in.(\"Pending\",\"RetryWaiting\")" } }),
    countRows("queue_jobs", { filters: { status: eq("DeadLetter") } }),
    selectRows<NotificationChannelRow>("notification_channels", { order: "created_at.desc" }),
    selectRows<NotificationApiKeyRow>("notification_api_keys", { order: "id.desc", limit: 20 }),
    selectRows<NotificationGroupRow>("notification_groups", { order: "name.asc" }),
    selectRows<NotificationTemplateRow>("notification_templates", { order: "name.asc" }),
  ]);

  return (
    <NotificationCenterDashboard
      stats={{ notifications: notifications.length, pendingJobs, failedJobs, channels: channels.filter((c) => c.enabled).length }}
      apiKeys={apiKeys.map((item) => ({ id: item.id, name: item.name, apiKey: item.api_key, enabled: item.enabled }))}
      groups={groups.map((item) => ({ id: item.id, name: item.name, description: item.description, enabled: item.enabled }))}
      channels={channels.map((item) => ({ id: item.id, name: item.name, type: item.type, config: JSON.stringify(item.config ?? {}), enabled: item.enabled }))}
      templates={templates.map((item) => ({ id: item.id, name: item.name, channelType: item.channel_type, content: item.content, enabled: item.enabled }))}
      notifications={notifications.map((item) => ({ id: item.id, title: item.title, status: item.status, createdAt: item.created_at, group: item.group?.name ?? "" }))}
    />
  );
}
