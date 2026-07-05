import { requireApiSession } from "@/lib/auth";
import { cancelNotification } from "@/lib/notification-center/manager";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  await cancelNotification(id);
  return Response.json({ success: true });
}
