import { getCurrentSession } from "@/lib/session";
import { ensureAppSettings } from "@/lib/bootstrap-settings";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await ensureAppSettings();
  const [factor, session] = await Promise.all([
    prisma.userTotpFactor.findFirst({ where: { revokedAt: null } }),
    getCurrentSession(),
  ]);

  return Response.json({
    otpConfigured: Boolean(factor),
    authenticated: Boolean(session),
    actor: session ? { userId: session.userId, role: session.user.role, displayName: session.user.displayName } : null,
  });
}
