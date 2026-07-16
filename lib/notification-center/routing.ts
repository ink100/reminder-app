import type {
  JsonObject,
  NotificationChannelRow,
  NotificationGroupRouteRow,
  NotificationTemplateRow,
} from "@/lib/notification-center/store";

export type EffectiveNotificationRoute = {
  channel: NotificationChannelRow;
  template: NotificationTemplateRow | null;
  config: JsonObject;
  source: "default" | "group";
  enabled: boolean;
  reason: string | null;
};

function compareTemplates(left: NotificationTemplateRow, right: NotificationTemplateRow) {
  return left.name.localeCompare(right.name, "zh-CN") || left.id.localeCompare(right.id);
}

export function selectDefaultTemplate(templates: NotificationTemplateRow[], channelType: string) {
  const candidates = templates
    .filter((template) => template.group_id === null && template.channel_type === channelType)
    .sort(compareTemplates);
  const configuredDefault = candidates.find((template) => template.is_default);
  if (configuredDefault) return configuredDefault.enabled ? configuredDefault : null;
  return candidates.find((template) => template.enabled) ?? null;
}

export function resolveEffectiveGroupRoutes(input: {
  groupId: string;
  channels: NotificationChannelRow[];
  templates: NotificationTemplateRow[];
  routes: NotificationGroupRouteRow[];
}): EffectiveNotificationRoute[] {
  const routeByChannel = new Map(
    input.routes.filter((route) => route.group_id === input.groupId).map((route) => [route.channel_id, route]),
  );

  return input.channels.map((channel) => {
    const route = routeByChannel.get(channel.id);
    const inherited = !route;

    if (inherited && !channel.is_default) {
      return { channel, template: null, config: channel.config ?? {}, source: "default", enabled: false, reason: "NOT_DEFAULT_CHANNEL" };
    }
    if (!channel.enabled) {
      return { channel, template: null, config: channel.config ?? {}, source: inherited ? "default" : "group", enabled: false, reason: "CHANNEL_DISABLED" };
    }
    if (route?.mode === "disabled") {
      return { channel, template: null, config: channel.config ?? {}, source: "group", enabled: false, reason: "GROUP_CHANNEL_DISABLED" };
    }

    const config = route?.mode === "custom"
      ? { ...(channel.config ?? {}), ...(route.config_override ?? {}) }
      : (channel.config ?? {});
    const defaultTemplate = selectDefaultTemplate(input.templates, channel.type);
    const selectedTemplate = route?.mode === "custom" && route.template_id
      ? input.templates.find((template) => template.id === route.template_id) ?? null
      : defaultTemplate;

    if (!selectedTemplate) {
      return { channel, template: null, config, source: route ? "group" : "default", enabled: false, reason: "TEMPLATE_MISSING" };
    }
    if (!selectedTemplate.enabled) {
      return { channel, template: selectedTemplate, config, source: route ? "group" : "default", enabled: false, reason: "TEMPLATE_DISABLED" };
    }
    if (selectedTemplate.channel_type !== channel.type) {
      return { channel, template: selectedTemplate, config, source: route ? "group" : "default", enabled: false, reason: "TEMPLATE_TYPE_MISMATCH" };
    }
    if (selectedTemplate.group_id && selectedTemplate.group_id !== input.groupId) {
      return { channel, template: selectedTemplate, config, source: route ? "group" : "default", enabled: false, reason: "TEMPLATE_GROUP_MISMATCH" };
    }

    return {
      channel,
      template: selectedTemplate,
      config,
      source: route?.mode === "custom" ? "group" : "default",
      enabled: true,
      reason: null,
    };
  });
}
