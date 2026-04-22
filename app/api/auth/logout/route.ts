import { deleteCurrentSession } from "@/lib/session";

export async function POST() {
  await deleteCurrentSession();

  return Response.json({ success: true });
}
