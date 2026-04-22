import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";

import { env } from "@/lib/env";

const OTP_PERIOD_SECONDS = 30;
const OTP_DIGITS = 6;
const OTP_WINDOW_SECONDS = 30;

export function generateOtpSecret() {
  return generateSecret();
}

export function buildOtpAuthUrl(secret: string) {
  return generateURI({
    strategy: "totp",
    issuer: env.APP_NAME,
    label: "admin",
    secret,
    digits: OTP_DIGITS,
    period: OTP_PERIOD_SECONDS,
    algorithm: "sha1",
  });
}

export async function generateOtpSetupPayload(secret: string) {
  const otpauthUrl = buildOtpAuthUrl(secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  return {
    secret,
    otpauthUrl,
    qrCodeDataUrl,
  };
}

export async function verifyOtpToken(secret: string, token: string) {
  const result = await verify({
    strategy: "totp",
    token,
    secret,
    digits: OTP_DIGITS,
    period: OTP_PERIOD_SECONDS,
    epochTolerance: OTP_WINDOW_SECONDS,
    algorithm: "sha1",
  });

  return result.valid;
}
