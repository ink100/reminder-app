import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/auth";
import { listTrustedDevices, revokeTrustedDevice } from "@/lib/trusted-device";

export async function GET() {
  const session = await requireApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const devices = await listTrustedDevices();
  return NextResponse.json({ devices });
}

export async function DELETE(request: Request) {
  const session = await requireApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  if (!id) {
    return NextResponse.json({ error: "缺少设备 ID" }, { status: 400 });
  }

  await revokeTrustedDevice(id);
  return NextResponse.json({ success: true });
}
