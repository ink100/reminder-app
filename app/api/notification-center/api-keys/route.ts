import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { generateNotificationApiKey } from "@/lib/notification-center/manager";
import { insertRow, newId, NotificationApiKeyRow, selectRows } from "@/lib/notification-center/store";

const schema = z.object({ name: z.string().min(1).default("Worker Key"), enabled: z.boolean().optional() });

export async function GET() {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const items = await selectRows<NotificationApiKeyRow>("notification_api_keys", { order: "id.desc" });
  return Response.json({ items: items.map((item) => ({ id: item.id, name: item.name, enabled: item.enabled, expiresAt: item.expires_at, apiKey: `${item.api_key.slice(0, 8)}...${item.api_key.slice(-4)}` })) });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const input = schema.parse(await request.json());
  const apiKey = generateNotificationApiKey();
  const item = await insertRow<NotificationApiKeyRow>("notification_api_keys", { id: newId("nak"), name: input.name, api_key: apiKey, enabled: input.enabled ?? true });
  return Response.json({ item: { id: item.id, name: item.name, enabled: item.enabled, expiresAt: item.expires_at, apiKey } }, { status: 201 });
}
