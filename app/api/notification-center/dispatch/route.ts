import { requireAdminApi } from "@/lib/admin-api";
import { cleanupNotificationData, dispatchQueueJobs } from "@/lib/notification-center/dispatcher";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const session = auth.actor;
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const dispatch = await dispatchQueueJobs(20);
  const cleanup = await cleanupNotificationData();
  return Response.json({ success: true, dispatch, cleanup });
}
