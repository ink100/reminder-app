import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createSessionInTransaction, issueSessionToken } from "@/lib/session";
import { createTrustedDeviceInTransaction, issueTrustedDeviceToken } from "@/lib/trusted-device";

const OTP_PERIOD_SECONDS = 30;
const OTP_DIGITS = 6;
const OTP_WINDOW_SECONDS = 30;

export function generateOtpSecret() {
  return generateSecret();
}

export function buildOtpAuthUrl(secret: string, label = "admin") {
  return generateURI({
    strategy: "totp",
    issuer: env.APP_NAME,
    label,
    secret,
    digits: OTP_DIGITS,
    period: OTP_PERIOD_SECONDS,
    algorithm: "sha1",
  });
}

export async function generateOtpSetupPayload(secret: string, label = "admin") {
  const otpauthUrl = buildOtpAuthUrl(secret, label);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  return {
    secret,
    otpauthUrl,
    qrCodeDataUrl,
  };
}

export async function verifyOtpToken(secret: string, token: string) {
  const result = await verifyOtpTokenDetails(secret, token);
  return result.valid;
}

export async function verifyOtpTokenDetails(
  secret: string,
  token: string,
  afterTimeStep?: number | null,
): Promise<{ valid: false } | { valid: true; timeStep: number }> {
  const result = await verify({
    strategy: "totp",
    token,
    secret,
    digits: OTP_DIGITS,
    period: OTP_PERIOD_SECONDS,
    epochTolerance: OTP_WINDOW_SECONDS,
    algorithm: "sha1",
    ...(afterTimeStep == null ? {} : { afterTimeStep }),
  });
  if (!result.valid || !("timeStep" in result)) return { valid: false };
  return { valid: true, timeStep: result.timeStep };
}

/** Commits OTP replay protection and every login credential under one rollback boundary. */
export async function commitOtpLogin(input: {
  factorId: string;
  userId: string;
  securityVersion: number;
  timeStep: number;
  ipAddress?: string | null;
  userAgent?: string | null;
  rememberDevice: boolean;
}) {
  const sessionIssue = issueSessionToken();
  const trustedIssue = input.rememberDevice ? issueTrustedDeviceToken() : null;
  await prisma.$transaction(async (tx) => {
    const accepted = await tx.userTotpFactor.updateMany({
      where: {
        id: input.factorId,
        userId: input.userId,
        revokedAt: null,
        OR: [{ lastAcceptedStep: null }, { lastAcceptedStep: { lt: input.timeStep } }],
      },
      data: { lastAcceptedStep: input.timeStep },
    });
    if (accepted.count !== 1) throw new Error("OTP step is stale or factor was revoked");
    await createSessionInTransaction(tx, {
      userId: input.userId,
      authMethod: "totp",
      securityVersion: input.securityVersion,
      issue: sessionIssue,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    if (trustedIssue) {
      await createTrustedDeviceInTransaction(tx, {
        userId: input.userId,
        securityVersion: input.securityVersion,
        tokenHash: trustedIssue.tokenHash,
        expiresAt: trustedIssue.expiresAt,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
    }
  });
  return { sessionToken: sessionIssue.token, trustedToken: trustedIssue?.token ?? null };
}

/** Installs an initial TOTP factor and its authenticated session atomically. */
export async function commitOtpSetup(input: {
  userId: string;
  securityVersion: number;
  secretEncrypted: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const now = new Date();
  const sessionIssue = issueSessionToken(now);
  await prisma.$transaction(async (tx) => {
    await tx.userTotpFactor.upsert({
      where: { userId: input.userId },
      update: { secretEncrypted: input.secretEncrypted, revokedAt: null, enabledAt: now },
      create: { userId: input.userId, secretEncrypted: input.secretEncrypted },
    });
    await createSessionInTransaction(tx, {
      userId: input.userId,
      authMethod: "totp",
      securityVersion: input.securityVersion,
      issue: sessionIssue,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  });
  return { sessionToken: sessionIssue.token };
}
