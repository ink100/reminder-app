import type { NextRequest } from "next/server";
import { z } from "zod";

import { createNotificationFromEvent, validateNotificationApiKey } from "@/lib/notification-center/manager";

export const runtime = "nodejs";

const notifySchema = z.object({
  group: z.string().trim().min(1),
  event_type: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().optional(),
  source: z.string().optional(),
  priority: z.coerce.number().int().min(0).max(3).optional(),
  payload: z.unknown().default({}),
});

function error(code: string, message: string, status = 400) {
  return Response.json({ error: true, code, message }, { status });
}

export async function POST(request: NextRequest) {
  const apiKey = await validateNotificationApiKey(request.headers.get("x-api-key"));
  if (!apiKey) return error("UNAUTHORIZED", "Invalid X-API-Key", 401);

  try {
    const input = notifySchema.parse(await request.json());
    const notification = await createNotificationFromEvent({
      group: input.group,
      eventType: input.event_type,
      title: input.title,
      summary: input.summary,
      source: input.source,
      payload: input.payload,
      priority: input.priority,
    });
    return Response.json({ success: true, notification_id: notification.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return error("BAD_REQUEST", message, 400);
  }
}
