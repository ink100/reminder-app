import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-api";
import { eq, insertRow, newId, NotificationChannelRow, selectOne, selectRows } from "@/lib/notification-center/store";

const schema = z.object({
  type: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(100),
  config: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
  is_default: z.boolean().optional(),
});

function serializeChannel(item: NotificationChannelRow) {
  const configKeys = Object.keys(item.config ?? {});
  return {
    id: item.id,
    type: item.type,
    name: item.name,
    enabled: item.enabled,
    isDefault: item.is_default,
    configured: configKeys.length > 0,
    configKeys,
    createdAt: item.created_at,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const session = auth.actor;
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const items = await selectRows<NotificationChannelRow>("notification_channels", { order: "created_at.desc" });
  return Response.json({ items: items.map(serializeChannel) });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const session = auth.actor;
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: true, code: "INVALID_CHANNEL", message: "渠道参数不合法" }, { status: 400 });
  const input = parsed.data;
  if (input.is_default) {
    const existingDefault = await selectOne<NotificationChannelRow>("notification_channels", {
      filters: { type: eq(input.type), is_default: eq(true) },
    });
    if (existingDefault) {
      return Response.json({ error: true, code: "DEFAULT_CHANNEL_EXISTS", message: "该类型已有默认渠道；请保留默认渠道并为分组设置覆盖配置" }, { status: 409 });
    }
  }
  const item = await insertRow<NotificationChannelRow>("notification_channels", {
    id: newId("nch"),
    type: input.type,
    name: input.name,
    config: input.config ?? {},
    enabled: input.enabled ?? true,
    is_default: input.is_default ?? false,
  });
  return Response.json({ item: serializeChannel(item) }, { status: 201 });
}
