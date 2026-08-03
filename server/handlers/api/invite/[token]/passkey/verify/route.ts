
import { INVALID_INVITATION } from "@/lib/invitation-acceptance";
import { completeInvitationPasskey } from "@/lib/invitation-passkey";
import { getTrustedClientIp } from "@/lib/login-throttle";
import { setSessionCookie } from "@/lib/session";
import { deleteTrustedDeviceCookie } from "@/lib/trusted-device";
import { ceremonyBrowserToken } from "@/lib/webauthn-cookie";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const result = await completeInvitationPasskey(token, await request.json(), ceremonyBrowserToken(request), {
      ipAddress: getTrustedClientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    await deleteTrustedDeviceCookie();
    await setSessionCookie(result.sessionToken);
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message === INVALID_INVITATION)) {
      return Response.json({ error: INVALID_INVITATION }, { status: 400 });
    }
    console.error("Invitation passkey completion failed", error);
    return Response.json({ error: "Unable to complete invitation" }, { status: 500 });
  }
}
