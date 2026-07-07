import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { insertRow, newId, NotificationChannelRow, selectRows } from "@/lib/notification-center/store";

const schema = z.object({ type: z.string().min(1), name: z.string().min(1), config: z.record(z.string(), z.unknown()).optional(), enabled: z.boolean().optional() });

export async function GET() {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const items = await selectRows<NotificationChannelRow>("notification_channels", { order: "created_at.desc" });
  return Response.json({ items: items.map((item) => ({ id: item.id, type: item.type, name: item.name, config: JSON.stringify(item.config ?? {}), enabled: item.enabled, createdAt: item.created_at })) });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const input = schema.parse(await request.json());
  const item = await insertRow<NotificationChannelRow>("notification_channels", { id: newId("nch"), type: input.type, name: input.name, config: input.config ?? {}, enabled: input.enabled ?? true });
  return Response.json({ item: { id: item.id, type: item.type, name: item.name, config: JSON.stringify(item.config ?? {}), enabled: item.enabled, createdAt: item.created_at } }, { status: 201 });
}
