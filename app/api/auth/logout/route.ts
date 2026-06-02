import { deleteCurrentSession } from "@/lib/session";
import { deleteTrustedDeviceCookie, getValidTrustedDevice, revokeTrustedDevice } from "@/lib/trusted-device";

export async function POST() {
  const trustedDevice = await getValidTrustedDevice();

  await deleteCurrentSession();

  if (trustedDevice) {
    await revokeTrustedDevice(trustedDevice.id);
  } else {
    await deleteTrustedDeviceCookie();
  }

  return Response.json({ success: true });
}
