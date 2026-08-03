
import { requireApiSession } from "@/lib/auth";
import { listTrustedDevices, revokeTrustedDevice } from "@/lib/trusted-device";

export async function GET() {
  const session = await requireApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const devices = await listTrustedDevices(session.userId);
  return Response.json({ devices });
}

export async function DELETE(request: Request) {
  const session = await requireApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  if (!id) {
    return Response.json({ error: "缺少设备 ID" }, { status: 400 });
  }

  await revokeTrustedDevice(session.userId, id);
  return Response.json({ success: true });
}
