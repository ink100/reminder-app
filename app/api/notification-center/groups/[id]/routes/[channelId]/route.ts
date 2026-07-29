import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-api";
import {
  deleteRows,
  eq,
  NotificationChannelRow,
  NotificationGroupRouteRow,
  NotificationGroupRow,
  NotificationTemplateRow,
  selectOne,
  upsertRow,
} from "@/lib/notification-center/store";

const schema = z.object({
  mode: z.enum(["custom", "disabled"]),
  templateId: z.string().min(1).nullable().optional(),
  configOverride: z.record(z.string(), z.unknown()).optional(),
});

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string; channelId: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const session = auth.actor;
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });

  const { id: groupId, channelId } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: true, code: "INVALID_GROUP_ROUTE", message: "分组配置参数不合法" }, { status: 400 });
  const input = parsed.data;
  const [group, channel, existing] = await Promise.all([
    selectOne<NotificationGroupRow>("notification_groups", { filters: { id: eq(groupId) } }),
    selectOne<NotificationChannelRow>("notification_channels", { filters: { id: eq(channelId) } }),
    selectOne<NotificationGroupRouteRow>("notification_group_routes", { filters: { group_id: eq(groupId), channel_id: eq(channelId) } }),
  ]);
  if (!group) return Response.json({ error: true, code: "GROUP_NOT_FOUND", message: "通知分组不存在" }, { status: 404 });
  if (!channel) return Response.json({ error: true, code: "CHANNEL_NOT_FOUND", message: "通知渠道不存在" }, { status: 404 });

  let templateId: string | null = input.mode === "disabled" ? null : (input.templateId === undefined ? existing?.template_id ?? null : input.templateId);
  if (templateId) {
    const template = await selectOne<NotificationTemplateRow>("notification_templates", { filters: { id: eq(templateId) } });
    if (!template) return Response.json({ error: true, code: "TEMPLATE_NOT_FOUND", message: "模板不存在" }, { status: 404 });
    if (!template.enabled) return Response.json({ error: true, code: "TEMPLATE_DISABLED", message: "所选模板已停用" }, { status: 409 });
    if (template.channel_type !== channel.type) {
      return Response.json({ error: true, code: "TEMPLATE_TYPE_MISMATCH", message: "模板类型与渠道类型不一致" }, { status: 400 });
    }
    if (template.group_id && template.group_id !== groupId) {
      return Response.json({ error: true, code: "TEMPLATE_GROUP_MISMATCH", message: "不能使用其他分组的自定义模板" }, { status: 400 });
    }
  }

  if (input.mode === "disabled") templateId = null;
  const now = new Date().toISOString();
  const item = await upsertRow<NotificationGroupRouteRow>("notification_group_routes", {
    group_id: groupId,
    channel_id: channelId,
    mode: input.mode,
    config_override: input.mode === "disabled" ? {} : (input.configOverride ?? existing?.config_override ?? {}),
    template_id: templateId,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  }, "group_id,channel_id");

  return Response.json({ item: {
    groupId: item.group_id,
    channelId: item.channel_id,
    mode: item.mode,
    templateId: item.template_id,
    configOverrideKeys: Object.keys(item.config_override ?? {}),
    updatedAt: item.updated_at,
  } });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string; channelId: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const session = auth.actor;
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const { id: groupId, channelId } = await context.params;
  await deleteRows("notification_group_routes", { group_id: eq(groupId), channel_id: eq(channelId) });
  return Response.json({ success: true, mode: "inherit" });
}
