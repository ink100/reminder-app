import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-api";
import {
  eq,
  insertRow,
  newId,
  NotificationGroupRow,
  NotificationTemplateRow,
  selectOne,
  selectRows,
} from "@/lib/notification-center/store";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  channel_type: z.string().trim().min(1).max(30),
  content: z.string().min(1).max(20_000),
  enabled: z.boolean().optional(),
  group_id: z.string().min(1).nullable().optional(),
  is_default: z.boolean().optional(),
});

function serializeTemplate(item: NotificationTemplateRow) {
  return {
    id: item.id,
    name: item.name,
    channelType: item.channel_type,
    content: item.content,
    enabled: item.enabled,
    groupId: item.group_id,
    isDefault: item.is_default,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const session = auth.actor;
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const items = await selectRows<NotificationTemplateRow>("notification_templates", { order: "name.asc" });
  return Response.json({ items: items.map(serializeTemplate) });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const session = auth.actor;
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: true, code: "INVALID_TEMPLATE", message: "模板参数不合法" }, { status: 400 });
  const input = parsed.data;
  const groupId = input.group_id ?? null;
  if (groupId) {
    const group = await selectOne<NotificationGroupRow>("notification_groups", { filters: { id: eq(groupId) } });
    if (!group) return Response.json({ error: true, code: "GROUP_NOT_FOUND", message: "通知分组不存在" }, { status: 404 });
  }
  if (groupId && input.is_default) {
    return Response.json({ error: true, code: "GROUP_TEMPLATE_CANNOT_BE_DEFAULT", message: "分组自定义模板不能设为全局默认模板" }, { status: 400 });
  }

  if (input.is_default) {
    const existingDefault = await selectOne<NotificationTemplateRow>("notification_templates", {
      filters: { channel_type: eq(input.channel_type), group_id: "is.null", is_default: eq(true) },
    });
    if (existingDefault) {
      return Response.json({ error: true, code: "DEFAULT_TEMPLATE_EXISTS", message: "该渠道类型已有默认模板；可直接编辑现有默认模板，或创建分组自定义模板" }, { status: 409 });
    }
  }

  const item = await insertRow<NotificationTemplateRow>("notification_templates", {
    id: newId("ntp"),
    name: input.name,
    channel_type: input.channel_type,
    content: input.content,
    enabled: input.enabled ?? true,
    group_id: groupId,
    is_default: Boolean(input.is_default && !groupId),
  });
  return Response.json({ item: serializeTemplate(item) }, { status: 201 });
}
