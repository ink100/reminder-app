import { requireAdminApi } from "@/lib/admin-api";
import { listNotifications, serializeNotification } from "@/lib/notification-center/manager";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const group = url.searchParams.get("group") || undefined;
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
  const offset = Number(url.searchParams.get("offset") || 0);

  const items = await listNotifications({ status, group, limit, offset });
  return Response.json({ items: items.map(serializeNotification) });
}
