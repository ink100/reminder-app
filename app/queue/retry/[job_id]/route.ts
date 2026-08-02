import { requireAdminApi } from "@/lib/admin-api";
import { retryQueueJob } from "@/lib/notification-center/manager";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ job_id: string }> }) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const { job_id } = await context.params;
  await retryQueueJob(job_id);
  return Response.json({ success: true });
}
