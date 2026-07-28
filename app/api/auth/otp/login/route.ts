import type { NextRequest } from "next/server";

import { decryptText } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/session";
import { createTrustedDevice } from "@/lib/trusted-device";
import { verifyOtpToken } from "@/lib/otp";
import { otpLoginSchema } from "@/lib/validators/auth";

const INVALID_LOGIN = { error: "用户名或验证码错误" };

export async function POST(request: NextRequest) {
  const body = otpLoginSchema.parse(await request.json());
  const user = await prisma.user.findUnique({
    where: { username: body.username },
    include: { totpFactor: true },
  });
  const factor = user?.status === "ACTIVE" && !user.totpFactor?.revokedAt ? user.totpFactor : null;
  if (!user || !factor) return Response.json(INVALID_LOGIN, { status: 400 });

  const verified = await verifyOtpToken(decryptText(factor.secretEncrypted), body.code);
  if (!verified) return Response.json(INVALID_LOGIN, { status: 400 });

  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent");
  await createSession(user.id, "totp", ipAddress, userAgent);
  if (body.rememberDevice) await createTrustedDevice(user.id, ipAddress, userAgent);
  return Response.json({ success: true });
}
