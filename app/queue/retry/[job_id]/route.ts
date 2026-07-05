import { requireApiSession } from "@/lib/auth";
import { retryQueueJob } from "@/lib/notification-center/manager";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ job_id: string }> }) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const { job_id } = await context.params;
  await retryQueueJob(job_id);
  return Response.json({ success: true });
}
