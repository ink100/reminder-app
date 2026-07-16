import { describe, expect, it } from "vitest";
import { resolveEffectiveGroupRoutes } from "@/lib/notification-center/routing";
import type { NotificationChannelRow, NotificationGroupRouteRow, NotificationTemplateRow } from "@/lib/notification-center/store";

const channel = (patch: Partial<NotificationChannelRow> = {}): NotificationChannelRow => ({
  id: "telegram-default",
  type: "Telegram",
  name: "默认 Telegram",
  config: { token: "base-token", chatId: "base-chat" },
  enabled: true,
  is_default: true,
  created_at: "2026-07-15T00:00:00.000Z",
  ...patch,
});

const template = (patch: Partial<NotificationTemplateRow> = {}): NotificationTemplateRow => ({
  id: "template-default",
  name: "默认模板",
  channel_type: "Telegram",
  content: "{{title}}",
  enabled: true,
  group_id: null,
  is_default: true,
  created_at: "2026-07-15T00:00:00.000Z",
  updated_at: "2026-07-15T00:00:00.000Z",
  ...patch,
});

const route = (patch: Partial<NotificationGroupRouteRow> = {}): NotificationGroupRouteRow => ({
  group_id: "server",
  channel_id: "telegram-default",
  mode: "custom",
  config_override: {},
  template_id: null,
  created_at: "2026-07-15T00:00:00.000Z",
  updated_at: "2026-07-15T00:00:00.000Z",
  ...patch,
});

describe("resolveEffectiveGroupRoutes", () => {
  it("inherits the default channel, config and template when a group has no route", () => {
    const [resolved] = resolveEffectiveGroupRoutes({ groupId: "server", channels: [channel()], templates: [template()], routes: [] });
    expect(resolved).toMatchObject({ enabled: true, source: "default", reason: null, config: { chatId: "base-chat" } });
    expect(resolved.template?.id).toBe("template-default");
  });

  it("does not inherit non-default channels", () => {
    const [resolved] = resolveEffectiveGroupRoutes({ groupId: "server", channels: [channel({ is_default: false })], templates: [template()], routes: [] });
    expect(resolved).toMatchObject({ enabled: false, reason: "NOT_DEFAULT_CHANNEL" });
  });

  it("allows a group to explicitly disable a default channel", () => {
    const [resolved] = resolveEffectiveGroupRoutes({ groupId: "server", channels: [channel()], templates: [template()], routes: [route({ mode: "disabled" })] });
    expect(resolved).toMatchObject({ enabled: false, source: "group", reason: "GROUP_CHANNEL_DISABLED" });
  });

  it("merges custom group config and selects the group's custom template", () => {
    const groupTemplate = template({ id: "server-template", name: "服务器模板", group_id: "server", is_default: false });
    const [resolved] = resolveEffectiveGroupRoutes({
      groupId: "server",
      channels: [channel()],
      templates: [template(), groupTemplate],
      routes: [route({ config_override: { chatId: "server-chat", token: null }, template_id: groupTemplate.id })],
    });
    expect(resolved.enabled).toBe(true);
    expect(resolved.source).toBe("group");
    expect(resolved.config).toEqual({ token: null, chatId: "server-chat" });
    expect(resolved.template?.id).toBe("server-template");
  });

  it("does not silently replace a disabled explicit default template", () => {
    const disabledDefault = template({ enabled: false });
    const fallback = template({ id: "other", name: "其他模板", is_default: false });
    const [resolved] = resolveEffectiveGroupRoutes({
      groupId: "server",
      channels: [channel()],
      templates: [disabledDefault, fallback],
      routes: [],
    });
    expect(resolved).toMatchObject({ enabled: false, reason: "TEMPLATE_MISSING" });
  });

  it("does not silently fall back when a selected custom template is disabled", () => {
    const disabled = template({ id: "disabled", group_id: "server", enabled: false, is_default: false });
    const [resolved] = resolveEffectiveGroupRoutes({
      groupId: "server",
      channels: [channel()],
      templates: [template(), disabled],
      routes: [route({ template_id: disabled.id })],
    });
    expect(resolved).toMatchObject({ enabled: false, reason: "TEMPLATE_DISABLED" });
  });

  it("keeps another group's template isolated", () => {
    const foreign = template({ id: "foreign", group_id: "inventory", is_default: false });
    const [resolved] = resolveEffectiveGroupRoutes({
      groupId: "server",
      channels: [channel()],
      templates: [template(), foreign],
      routes: [route({ template_id: foreign.id })],
    });
    expect(resolved).toMatchObject({ enabled: false, reason: "TEMPLATE_GROUP_MISMATCH" });
  });
});
