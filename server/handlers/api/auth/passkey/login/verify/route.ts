
import { setSessionCookie } from "@/lib/session";
import { deleteTrustedDeviceCookie, setTrustedDeviceCookie } from "@/lib/trusted-device";
import { verifyAuthResponse } from "@/lib/webauthn";
import { ceremonyBrowserToken } from "@/lib/webauthn-cookie";
import { getTrustedClientIp, reserveAnonymousAuthAttempt } from "@/lib/login-throttle";

export async function POST(request: Request) {
  try {
    const ipAddress = getTrustedClientIp(request.headers);
    if (!(await reserveAnonymousAuthAttempt("PASSKEY_VERIFY", ipAddress))) {
      return Response.json({ error: "请求过于频繁" }, { status: 429 });
    }
    const body = await request.json();
    const { rememberDevice, ceremonyId, ...authResponse } = body;
    if (typeof ceremonyId !== "string" || !ceremonyId) throw new Error("WebAuthn ceremony is invalid, expired, or used");
    const result = await verifyAuthResponse(authResponse, ceremonyBrowserToken(request), ceremonyId, {
      rememberDevice: Boolean(rememberDevice),
      ipAddress,
      userAgent: request.headers.get("user-agent"),
    });

    // Set both response credentials only after challenge/counter/session commit.
    // Trusted first avoids exposing a logged-in session if that optional cookie fails.
    if (result.trustedToken) await setTrustedDeviceCookie(result.trustedToken);
    else await deleteTrustedDeviceCookie();
    await setSessionCookie(result.sessionToken);
    return Response.json({ verified: true, userId: result.userId });
  } catch (error) {
    console.error("认证验证失败:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "认证验证失败" },
      { status: 400 },
    );
  }
}
