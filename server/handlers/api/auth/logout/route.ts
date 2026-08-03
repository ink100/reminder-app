import { logoutCurrentDevice } from "@/lib/trusted-device";

export async function POST() {
  await logoutCurrentDevice();
  return Response.json({ success: true });
}
