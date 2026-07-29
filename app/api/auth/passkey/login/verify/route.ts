import { type NextRequest, NextResponse } from "next/server";

import { setSessionCookie } from "@/lib/session";
import { deleteTrustedDeviceCookie, setTrustedDeviceCookie } from "@/lib/trusted-device";
import { verifyAuthResponse } from "@/lib/webauthn";
import { ceremonyBrowserToken } from "@/lib/webauthn-cookie";
import { getTrustedClientIp, reserveAnonymousAuthAttempt } from "@/lib/login-throttle";

export async function POST(request: NextRequest) {
  try {
    const ipAddress = getTrustedClientIp(request.headers);
    if (!(await reserveAnonymousAuthAttempt("PASSKEY_VERIFY", ipAddress))) {
      return NextResponse.json({ error: "请求过于频繁" }, { status: 429 });
    }
    const body = await request.json();
    const { rememberDevice, ...authResponse } = body;
    const result = await verifyAuthResponse(authResponse, ceremonyBrowserToken(request), {
      rememberDevice: Boolean(rememberDevice),
      ipAddress,
      userAgent: request.headers.get("user-agent"),
    });

    // Set both response credentials only after challenge/counter/session commit.
    // Trusted first avoids exposing a logged-in session if that optional cookie fails.
    if (result.trustedToken) await setTrustedDeviceCookie(result.trustedToken);
    else await deleteTrustedDeviceCookie();
    await setSessionCookie(result.sessionToken);
    return NextResponse.json({ verified: true, userId: result.userId });
  } catch (error) {
    console.error("认证验证失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "认证验证失败" },
      { status: 400 },
    );
  }
}
