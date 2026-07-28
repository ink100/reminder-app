import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

import { ensureAppSettings } from "@/lib/bootstrap-settings";
import { OTP_SETUP_COOKIE_NAME } from "@/lib/constants/auth";
import { decryptText, encryptText } from "@/lib/crypto";
import { appSettingStore } from "@/lib/app-settings/store";
import { createSession } from "@/lib/session";
import { verifyOtpToken } from "@/lib/otp";
import { otpCodeSchema } from "@/lib/validators/auth";
import { prisma } from "@/lib/prisma";
import { requireAdminApiSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const actor = await requireAdminApiSession();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await ensureAppSettings();

  if (settings.otpSecretEncrypted) {
    return Response.json({ error: "OTP 已经配置" }, { status: 409 });
  }

  const body = otpCodeSchema.parse(await request.json());

  const cookieStore = await cookies();
  const encryptedSecret = cookieStore.get(OTP_SETUP_COOKIE_NAME)?.value;

  if (!encryptedSecret) {
    return Response.json({ error: "OTP 初始化已过期，请刷新后重试" }, { status: 400 });
  }

  const secret = decryptText(encryptedSecret);
  const verified = await verifyOtpToken(secret, body.code);

  if (!verified) {
    return Response.json({ error: "验证码错误" }, { status: 400 });
  }

  const encryptedForStorage = encryptText(secret);
  await appSettingStore.update({
    where: { id: 1 },
    data: {
      otpSecretEncrypted: encryptedForStorage,
      otpConfiguredAt: new Date(),
    },
  });
  const user = actor.user;
  await prisma.userTotpFactor.upsert({
    where: { userId: user.id },
    update: { secretEncrypted: encryptedForStorage, revokedAt: null, enabledAt: new Date() },
    create: { userId: user.id, secretEncrypted: encryptedForStorage },
  });

  cookieStore.delete(OTP_SETUP_COOKIE_NAME);

  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() ?? null;

  await createSession(user.id, "totp", ipAddress, request.headers.get("user-agent"));

  return Response.json({ success: true });
}
