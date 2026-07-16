import { NotificationCenterDashboard } from "@/components/notification-center/dashboard";
import { listNotifications } from "@/lib/notification-center/manager";
import {
  countRows,
  eq,
  NotificationApiKeyRow,
  NotificationChannelRow,
  NotificationGroupRouteRow,
  NotificationGroupRow,
  NotificationTemplateRow,
  selectRows,
} from "@/lib/notification-center/store";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const [notifications, notificationCount, pendingJobs, failedJobs, channels, apiKeys, groups, templates, routes] = await Promise.all([
    listNotifications({ limit: 20, offset: 0 }),
    countRows("notifications"),
    countRows("queue_jobs", { filters: { status: "in.(\"Pending\",\"RetryWaiting\")" } }),
    countRows("queue_jobs", { filters: { status: eq("DeadLetter") } }),
    selectRows<NotificationChannelRow>("notification_channels", { order: "created_at.desc" }),
    selectRows<NotificationApiKeyRow>("notification_api_keys", { order: "id.desc", limit: 20 }),
    selectRows<NotificationGroupRow>("notification_groups", { order: "name.asc" }),
    selectRows<NotificationTemplateRow>("notification_templates", { order: "name.asc" }),
    selectRows<NotificationGroupRouteRow>("notification_group_routes", { order: "updated_at.desc" }),
  ]);

  return (
    <NotificationCenterDashboard
      stats={{ notifications: notificationCount, pendingJobs, failedJobs, channels: channels.filter((channel) => channel.enabled).length }}
      apiKeys={apiKeys.map((item) => ({
        id: item.id,
        name: item.name,
        apiKey: item.api_key,
        enabled: item.enabled,
      }))}
      groups={groups.map((item) => ({ id: item.id, name: item.name, description: item.description, enabled: item.enabled }))}
      channels={channels.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        enabled: item.enabled,
        isDefault: item.is_default,
        configured: Object.keys(item.config ?? {}).length > 0,
      }))}
      templates={templates.map((item) => ({
        id: item.id,
        name: item.name,
        channelType: item.channel_type,
        content: item.content,
        enabled: item.enabled,
        groupId: item.group_id,
        isDefault: item.is_default,
      }))}
      routes={routes.map((item) => ({
        groupId: item.group_id,
        channelId: item.channel_id,
        mode: item.mode,
        templateId: item.template_id,
        configOverrideKeys: Object.keys(item.config_override ?? {}),
      }))}
      notifications={notifications.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        createdAt: item.created_at,
        group: item.group?.name ?? "",
      }))}
    />
  );
}
