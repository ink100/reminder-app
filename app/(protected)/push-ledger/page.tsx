import { PushLedgerDashboard } from "@/components/notification-center/push-ledger-dashboard";
import { countRows, eq, PushLedgerRow, selectRows } from "@/lib/notification-center/store";

export const dynamic = "force-dynamic";

export default async function PushLedgerPage() {
  const [items, total, success, pending, failed] = await Promise.all([
    selectRows<PushLedgerRow>("push_ledgers", { order: "created_at.desc", limit: 100 }),
    countRows("push_ledgers"),
    countRows("push_ledgers", { filters: { status: eq("Success") } }),
    countRows("push_ledgers", { filters: { status: "in.(\"Pending\",\"Processing\",\"RetryWaiting\")" } }),
    countRows("push_ledgers", { filters: { status: "in.(\"Failed\",\"DeadLetter\")" } }),
  ]);

  return (
    <PushLedgerDashboard
      items={items.map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        channelType: item.channel_type,
        channelName: item.channel_name,
        target: item.target,
        status: item.status,
        retryCount: item.retry_count,
        attemptCount: item.attempt_count,
        error: item.error,
        durationMs: item.duration_ms,
        createdAt: new Date(item.created_at),
        queuedAt: new Date(item.queued_at),
        startedAt: item.started_at ? new Date(item.started_at) : null,
        sentAt: item.sent_at ? new Date(item.sent_at) : null,
        failedAt: item.failed_at ? new Date(item.failed_at) : null,
        lastRetryAt: item.last_retry_at ? new Date(item.last_retry_at) : null,
        businessType: item.business_type,
        businessId: item.business_id,
      }))}
      stats={{ total, success, pending, failed }}
    />
  );
}
