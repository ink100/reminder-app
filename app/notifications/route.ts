import type { NextRequest } from "next/server";

import { requireApiSession } from "@/lib/auth";
import { listNotifications, serializeNotification } from "@/lib/notification-center/manager";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const group = url.searchParams.get("group") || undefined;
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
  const offset = Number(url.searchParams.get("offset") || 0);

  const items = await listNotifications({ status, group, limit, offset });
  return Response.json({ items: items.map(serializeNotification) });
}
