import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clearAllSessions } from "@/lib/session";

export async function POST() {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.appSetting.update({
    where: { id: 1 },
    data: {
      otpSecretEncrypted: null,
      otpConfiguredAt: null,
    },
  });

  await clearAllSessions();

  return Response.json({ success: true });
}
