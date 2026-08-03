
import { z } from "zod";

import { completeInvitationTotp, INVALID_INVITATION } from "@/lib/invitation-acceptance";
import { getTrustedClientIp } from "@/lib/login-throttle";
import { setSessionCookie } from "@/lib/session";
import { deleteTrustedDeviceCookie } from "@/lib/trusted-device";

const input = z.object({ code: z.string().regex(/^\d{6}$/), enrollmentId: z.string().min(1) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = input.parse(await request.json());
    const result = await completeInvitationTotp(token, body.code, body.enrollmentId, {
      ipAddress: getTrustedClientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    await deleteTrustedDeviceCookie();
    await setSessionCookie(result.sessionToken);
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError || (error instanceof Error && error.message === INVALID_INVITATION)) {
      return Response.json({ error: INVALID_INVITATION }, { status: 400 });
    }
    console.error("Invitation TOTP completion failed", error);
    return Response.json({ error: "Unable to complete invitation" }, { status: 500 });
  }
}
