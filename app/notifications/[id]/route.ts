import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeNotification } from "@/lib/notification-center/manager";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const item = await prisma.notification.findUnique({ where: { id }, include: { group: true, event: true, jobs: { include: { channel: true, template: true, sendLogs: { orderBy: { createdAt: "desc" }, take: 10 } } } } });
  if (!item) return Response.json({ error: true, code: "NOT_FOUND", message: "Notification not found" }, { status: 404 });

  return Response.json({ item: serializeNotification(item), jobs: item.jobs.map((job) => ({ id: job.id, channel: job.channel.name, type: job.channel.type, status: job.status, retry_count: job.retryCount, max_retry: job.maxRetry, next_execute_at: job.nextExecuteAt.toISOString(), last_error: job.lastError, logs: job.sendLogs.map((log) => ({ id: log.id, result: log.result, duration_ms: log.durationMs, created_at: log.createdAt.toISOString(), response: log.response })) })) });
}
