import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { insertRow, newId, NotificationTemplateRow, selectRows } from "@/lib/notification-center/store";

const schema = z.object({ name: z.string().min(1), channel_type: z.string().min(1), content: z.string().min(1), enabled: z.boolean().optional() });

export async function GET() {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const items = await selectRows<NotificationTemplateRow>("notification_templates", { order: "name.asc" });
  return Response.json({ items: items.map((item) => ({ id: item.id, name: item.name, channelType: item.channel_type, content: item.content, enabled: item.enabled })) });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const input = schema.parse(await request.json());
  const item = await insertRow<NotificationTemplateRow>("notification_templates", { id: newId("ntp"), name: input.name, channel_type: input.channel_type, content: input.content, enabled: input.enabled ?? true });
  return Response.json({ item: { id: item.id, name: item.name, channelType: item.channel_type, content: item.content, enabled: item.enabled } }, { status: 201 });
}
