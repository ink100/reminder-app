import type { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { serializeJob } from "@/lib/notification-center/manager";
import { eq, NotificationChannelRow, NotificationRow, QueueJobRow, selectOne, selectRows } from "@/lib/notification-center/store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
  const jobs = await selectRows<QueueJobRow>("queue_jobs", { filters: status ? { status: eq(status) } : {}, order: "created_at.desc", limit });
  const items = await Promise.all(jobs.map(async (job) => ({
    ...job,
    channel: await selectOne<NotificationChannelRow>("notification_channels", { filters: { id: eq(job.channel_id) } }),
    notification: await selectOne<NotificationRow>("notifications", { filters: { id: eq(job.notification_id) } }),
  })));
  return Response.json({ items: items.map(serializeJob) });
}
