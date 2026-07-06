import type { NextRequest } from "next/server";

import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseJsonObject } from "@/lib/notification-center/types";

export const runtime = "nodejs";

function serializeLedger(item: Awaited<ReturnType<typeof prisma.pushLedger.findMany>>[number]) {
  return {
    id: item.id,
    notification_id: item.notificationId,
    queue_job_id: item.queueJobId,
    channel_id: item.channelId,
    channel_type: item.channelType,
    channel_name: item.channelName,
    target: item.target,
    title: item.title,
    content: item.content,
    raw_payload: parseJsonObject(item.rawPayload),
    business_type: item.businessType,
    business_id: item.businessId,
    status: item.status,
    retry_count: item.retryCount,
    attempt_count: item.attemptCount,
    request: item.request ? parseJsonObject(item.request) : null,
    response: item.response ? parseJsonObject(item.response) : null,
    error: item.error,
    duration_ms: item.durationMs,
    queued_at: item.queuedAt.toISOString(),
    started_at: item.startedAt?.toISOString() ?? null,
    sent_at: item.sentAt?.toISOString() ?? null,
    failed_at: item.failedAt?.toISOString() ?? null,
    last_retry_at: item.lastRetryAt?.toISOString() ?? null,
    created_at: item.createdAt.toISOString(),
    updated_at: item.updatedAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const channelType = url.searchParams.get("channel_type") || undefined;
  const q = url.searchParams.get("q") || undefined;
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
  const offset = Number(url.searchParams.get("offset") || 0);

  const where = {
    ...(status ? { status } : {}),
    ...(channelType ? { channelType } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q } },
            { content: { contains: q } },
            { target: { contains: q } },
            { businessId: { contains: q } },
            { error: { contains: q } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.pushLedger.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
    prisma.pushLedger.count({ where }),
  ]);

  return Response.json({ items: items.map(serializeLedger), total, limit, offset });
}
