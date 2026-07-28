import { cookies } from "next/headers";

import { ensureAppSettings } from "@/lib/bootstrap-settings";
import { OTP_SETUP_COOKIE_NAME, OTP_SETUP_MAX_AGE_SECONDS } from "@/lib/constants/auth";
import { encryptText } from "@/lib/crypto";
import { env } from "@/lib/env";
import { generateOtpSecret, generateOtpSetupPayload } from "@/lib/otp";
import { requireAdminApiSession } from "@/lib/auth";

export async function POST() {
  const actor = await requireAdminApiSession();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await ensureAppSettings();

  if (settings.otpSecretEncrypted) {
    return Response.json({ error: "OTP 已经配置" }, { status: 409 });
  }

  const secret = generateOtpSecret();
  const payload = await generateOtpSetupPayload(secret);

  const cookieStore = await cookies();
  cookieStore.set(OTP_SETUP_COOKIE_NAME, encryptText(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.APP_BASE_URL.startsWith("https://"),
    path: "/",
    maxAge: OTP_SETUP_MAX_AGE_SECONDS,
  });

  return Response.json({
    qrCodeDataUrl: payload.qrCodeDataUrl,
    secret: payload.secret,
  });
}
