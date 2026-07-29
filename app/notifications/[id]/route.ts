import { requireAdminApi } from "@/lib/admin-api";
import { getNotificationWithContext, serializeNotification } from "@/lib/notification-center/manager";
import { eq, NotificationChannelRow, NotificationTemplateRow, QueueJobRow, selectOne, selectRows, SendLogRow } from "@/lib/notification-center/store";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const item = await getNotificationWithContext(id);
  if (!item) return Response.json({ error: true, code: "NOT_FOUND", message: "Notification not found" }, { status: 404 });

  const jobs = await selectRows<QueueJobRow>("queue_jobs", { filters: { notification_id: eq(id) }, order: "created_at.desc" });
  const enriched = await Promise.all(jobs.map(async (job) => {
    const [channel, template, logs] = await Promise.all([
      selectOne<NotificationChannelRow>("notification_channels", { filters: { id: eq(job.channel_id) } }),
      selectOne<NotificationTemplateRow>("notification_templates", { filters: { id: eq(job.template_id) } }),
      selectRows<SendLogRow>("send_logs", { filters: { queue_job_id: eq(job.id) }, order: "created_at.desc", limit: 10 }),
    ]);
    return { job, channel, template, logs };
  }));

  return Response.json({
    item: serializeNotification(item),
    jobs: enriched.map(({ job, channel, logs }) => ({
      id: job.id,
      channel: channel?.name ?? "",
      type: channel?.type ?? "",
      status: job.status,
      retry_count: job.retry_count,
      max_retry: job.max_retry,
      next_execute_at: new Date(job.next_execute_at).toISOString(),
      last_error: job.last_error,
      logs: logs.map((log) => ({ id: log.id, result: log.result, duration_ms: log.duration_ms, created_at: new Date(log.created_at).toISOString(), response: log.response })),
    })),
  });
}
