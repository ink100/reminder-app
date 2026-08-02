import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-api";
import { eq, NotificationGroupRow, selectOne, updateRows } from "@/lib/notification-center/store";

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const session = auth.actor;
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const existing = await selectOne<NotificationGroupRow>("notification_groups", { filters: { id: eq(id) } });
  if (!existing) return Response.json({ error: true, code: "GROUP_NOT_FOUND", message: "通知分组不存在" }, { status: 404 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: true, code: "INVALID_GROUP", message: "分组参数不合法" }, { status: 400 });
  if (parsed.data.name && parsed.data.name !== existing.name) {
    const duplicate = await selectOne<NotificationGroupRow>("notification_groups", { filters: { name: eq(parsed.data.name) } });
    if (duplicate) return Response.json({ error: true, code: "GROUP_NAME_EXISTS", message: "分组名称已存在" }, { status: 409 });
  }

  const rows = await updateRows<NotificationGroupRow>("notification_groups", { id: eq(id) }, parsed.data);
  return Response.json({ item: rows[0] ?? existing });
}
