import type { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
  const jobs = await prisma.queueJob.findMany({ where: status ? { status } : {}, include: { channel: true, notification: true }, orderBy: { createdAt: "desc" }, take: limit });
  return Response.json({ items: jobs.map((job) => ({ id: job.id, notification_id: job.notificationId, notification_title: job.notification.title, channel: job.channel.name, type: job.channel.type, status: job.status, retry_count: job.retryCount, max_retry: job.maxRetry, next_execute_at: job.nextExecuteAt.toISOString(), last_error: job.lastError })) });
}
