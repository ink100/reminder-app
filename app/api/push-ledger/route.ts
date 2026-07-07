import type { NextRequest } from "next/server";

import { requireApiSession } from "@/lib/auth";
import { countRows, eq, ilikeContains, PushLedgerRow, selectRows } from "@/lib/notification-center/store";

export const runtime = "nodejs";

function serializeLedger(item: PushLedgerRow) {
  return {
    id: item.id,
    notification_id: item.notification_id,
    queue_job_id: item.queue_job_id,
    channel_id: item.channel_id,
    channel_type: item.channel_type,
    channel_name: item.channel_name,
    target: item.target,
    title: item.title,
    content: item.content,
    raw_payload: item.raw_payload,
    business_type: item.business_type,
    business_id: item.business_id,
    status: item.status,
    retry_count: item.retry_count,
    attempt_count: item.attempt_count,
    request: item.request,
    response: item.response,
    error: item.error,
    duration_ms: item.duration_ms,
    queued_at: new Date(item.queued_at).toISOString(),
    started_at: item.started_at ? new Date(item.started_at).toISOString() : null,
    sent_at: item.sent_at ? new Date(item.sent_at).toISOString() : null,
    failed_at: item.failed_at ? new Date(item.failed_at).toISOString() : null,
    last_retry_at: item.last_retry_at ? new Date(item.last_retry_at).toISOString() : null,
    created_at: new Date(item.created_at).toISOString(),
    updated_at: new Date(item.updated_at).toISOString(),
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

  const filters: Record<string, string> = {};
  if (status) filters.status = eq(status);
  if (channelType) filters.channel_type = eq(channelType);
  const or = q ? `title.${ilikeContains(q)},content.${ilikeContains(q)},target.${ilikeContains(q)},business_id.${ilikeContains(q)},error.${ilikeContains(q)}` : undefined;

  const [items, total] = await Promise.all([
    selectRows<PushLedgerRow>("push_ledgers", { filters, or, order: "created_at.desc", limit, offset }),
    countRows("push_ledgers", { filters, or }),
  ]);

  return Response.json({ items: items.map(serializeLedger), total, limit, offset });
}
