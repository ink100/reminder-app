import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-api";
import {
  eq,
  NotificationGroupRow,
  NotificationTemplateRow,
  selectOne,
  updateRows,
} from "@/lib/notification-center/store";

const schema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  channel_type: z.string().trim().min(1).max(30).optional(),
  content: z.string().min(1).max(20_000).optional(),
  enabled: z.boolean().optional(),
  group_id: z.string().min(1).nullable().optional(),
  is_default: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const session = auth.actor;
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const existing = await selectOne<NotificationTemplateRow>("notification_templates", { filters: { id: eq(id) } });
  if (!existing) return Response.json({ error: true, code: "TEMPLATE_NOT_FOUND", message: "模板不存在" }, { status: 404 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: true, code: "INVALID_TEMPLATE", message: "模板参数不合法" }, { status: 400 });
  const input = parsed.data;
  const groupId = input.group_id === undefined ? existing.group_id : input.group_id;
  const channelType = input.channel_type ?? existing.channel_type;

  if (input.is_default !== undefined && input.is_default !== existing.is_default) {
    return Response.json({ error: true, code: "DEFAULT_TEMPLATE_IMMUTABLE", message: "默认模板标识不能直接切换；可编辑现有默认模板内容，分组请选择自定义模板" }, { status: 409 });
  }
  if (groupId !== existing.group_id || channelType !== existing.channel_type) {
    return Response.json({ error: true, code: "TEMPLATE_SCOPE_IMMUTABLE", message: "模板创建后不能改变所属范围或渠道类型；请新建模板后切换引用" }, { status: 409 });
  }

  if (groupId) {
    const group = await selectOne<NotificationGroupRow>("notification_groups", { filters: { id: eq(groupId) } });
    if (!group) return Response.json({ error: true, code: "GROUP_NOT_FOUND", message: "通知分组不存在" }, { status: 404 });
  }

  const rows = await updateRows<NotificationTemplateRow>("notification_templates", { id: eq(id) }, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.channel_type !== undefined ? { channel_type: input.channel_type } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.group_id !== undefined ? { group_id: input.group_id } : {}),
    is_default: existing.is_default,
    updated_at: new Date().toISOString(),
  });
  const item = rows[0];
  if (!item) return Response.json({ error: true, code: "TEMPLATE_NOT_FOUND", message: "模板不存在" }, { status: 404 });
  return Response.json({ item: {
    id: item.id,
    name: item.name,
    channelType: item.channel_type,
    content: item.content,
    enabled: item.enabled,
    groupId: item.group_id,
    isDefault: item.is_default,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  } });
}
