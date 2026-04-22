import type { NextRequest } from "next/server";

import { ensureAppSettings } from "@/lib/bootstrap-settings";
import { decryptText } from "@/lib/crypto";
import { createSession } from "@/lib/session";
import { verifyOtpToken } from "@/lib/otp";
import { otpCodeSchema } from "@/lib/validators/auth";

export async function POST(request: NextRequest) {
  const settings = await ensureAppSettings();

  if (!settings.otpSecretEncrypted) {
    return Response.json({ error: "OTP 尚未配置" }, { status: 400 });
  }

  const body = otpCodeSchema.parse(await request.json());
  const secret = decryptText(settings.otpSecretEncrypted);
  const verified = await verifyOtpToken(secret, body.code);

  if (!verified) {
    return Response.json({ error: "验证码错误" }, { status: 400 });
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() ?? null;

  await createSession(ipAddress, request.headers.get("user-agent"));

  return Response.json({ success: true });
}
