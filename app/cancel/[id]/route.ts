import { requireAdminApi } from "@/lib/admin-api";
import { cancelNotification } from "@/lib/notification-center/manager";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  const { id } = await context.params;
  await cancelNotification(id);
  return Response.json({ success: true });
}
