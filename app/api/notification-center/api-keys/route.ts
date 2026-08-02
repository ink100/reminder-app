import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-api";
import { generateNotificationApiKey, notificationApiKeyScopes } from "@/lib/notification-center/manager";
import { insertRow, newId, NotificationApiKeyRow, selectRows } from "@/lib/notification-center/store";

const schema = z.object({ name: z.string().min(1).default("Worker Key"), enabled: z.boolean().optional(), type: z.enum(["worker", "ai"]).default("worker") });

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const session = auth.actor;
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const items = await selectRows<NotificationApiKeyRow>("notification_api_keys", { order: "id.desc" });
  return Response.json({ items: items.map((item) => ({ id: item.id, name: item.name, enabled: item.enabled, expiresAt: item.expires_at, apiKey: item.api_key, scopes: notificationApiKeyScopes(item) })) });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const session = auth.actor;
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const input = schema.parse(await request.json());
  const apiKey = generateNotificationApiKey();
  const scopes = input.type === "ai" ? ["ai:all", "notifications:send"] : ["notifications:send"];
  const item = await insertRow<NotificationApiKeyRow>("notification_api_keys", { id: newId("nak"), name: input.name, api_key: apiKey, enabled: input.enabled ?? true, scopes });
  return Response.json({ item: { id: item.id, name: item.name, enabled: item.enabled, expiresAt: item.expires_at, apiKey, scopes } }, { status: 201 });
}
