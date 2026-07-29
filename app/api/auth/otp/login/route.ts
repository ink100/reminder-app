import type { NextRequest } from "next/server";

import { decryptText } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/session";
import { deleteTrustedDeviceCookie, setTrustedDeviceCookie } from "@/lib/trusted-device";
import { commitOtpLogin, verifyOtpTokenDetails } from "@/lib/otp";
import { getTrustedClientIp, recordLoginSuccess, reserveLoginAttempt } from "@/lib/login-throttle";
import { otpLoginSchema } from "@/lib/validators/auth";

const INVALID_LOGIN = { error: "用户名或验证码错误" };

export async function POST(request: NextRequest) {
  const body = otpLoginSchema.parse(await request.json());
  const ipAddress = getTrustedClientIp(request.headers);
  if (!(await reserveLoginAttempt(body.username, ipAddress))) return Response.json(INVALID_LOGIN, { status: 429 });

  const user = await prisma.user.findUnique({ where: { username: body.username }, include: { totpFactor: true } });
  const factor = user?.status === "ACTIVE" && !user.totpFactor?.revokedAt ? user.totpFactor : null;
  if (!user || !factor) return Response.json(INVALID_LOGIN, { status: 400 });

  const verification = await verifyOtpTokenDetails(decryptText(factor.secretEncrypted), body.code, factor.lastAcceptedStep);
  if (!verification.valid) return Response.json(INVALID_LOGIN, { status: 400 });

  const userAgent = request.headers.get("user-agent");
  let committed: Awaited<ReturnType<typeof commitOtpLogin>>;
  try {
    committed = await commitOtpLogin({
      factorId: factor.id,
      userId: user.id,
      securityVersion: user.securityVersion,
      timeStep: verification.timeStep,
      ipAddress,
      userAgent,
      rememberDevice: body.rememberDevice,
    });
  } catch {
    return Response.json(INVALID_LOGIN, { status: 400 });
  }

  // Throttle cleanup is best-effort and cannot turn a committed login into an ambiguous failure.
  await recordLoginSuccess(body.username, ipAddress).catch((error) => console.error("清理账户登录限流失败:", error));
  // Trusted first avoids exposing a logged-in session if the optional cookie fails.
  if (committed.trustedToken) await setTrustedDeviceCookie(committed.trustedToken);
  else await deleteTrustedDeviceCookie();
  await setSessionCookie(committed.sessionToken);
  return Response.json({ success: true });
}
