import { requireApiSession } from "@/lib/auth";
import { cleanupNotificationData, dispatchQueueJobs } from "@/lib/notification-center/dispatcher";

export const runtime = "nodejs";

export async function POST() {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const dispatch = await dispatchQueueJobs(20);
  const cleanup = await cleanupNotificationData();
  return Response.json({ success: true, dispatch, cleanup });
}
