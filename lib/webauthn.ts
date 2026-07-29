import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialDescriptorJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { consumeWebAuthnCeremony, consumeWebAuthnCeremonyInTransaction, createWebAuthnCeremony, getWebAuthnCeremony } from "@/lib/webauthn-ceremonies";
import { createSessionInTransaction, issueSessionToken } from "@/lib/session";
import { createTrustedDeviceInTransaction, issueTrustedDeviceToken } from "@/lib/trusted-device";

const EXTERNAL_AUTHENTICATOR_TRANSPORTS: AuthenticatorTransportFuture[] = [
  "hybrid",
  "internal",
  "usb",
  "ble",
  "nfc",
];

type BrowserOptimizedRegistrationOptions = PublicKeyCredentialCreationOptionsJSON & {
  transports?: AuthenticatorTransportFuture[];
};

// 应用名称和域名配置
const RP_NAME = "到期提醒";
const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";
const ORIGIN = process.env.WEBAUTHN_ORIGIN || process.env.APP_BASE_URL || "http://localhost:63456";

/**
 * 生成注册选项
 */
export async function generateRegOptions(userId: string, browserToken: string, authenticatorAttachment?: "platform" | "cross-platform") {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  // 获取当前用户已注册的凭证
  const existingCredentials = await prisma.webAuthnCredential.findMany({
    where: { userId },
    select: {
      credentialId: true,
    },
  });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: user.username,
    userDisplayName: user.displayName,
    attestationType: "none",
    excludeCredentials: existingCredentials.map((cred) => ({
      id: cred.credentialId,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
      ...(authenticatorAttachment ? { authenticatorAttachment } : {}),
    },
  });

  // 添加 hints 提示浏览器显示手机扫码选项
  if (authenticatorAttachment === "cross-platform") {
    const browserOptions = options as BrowserOptimizedRegistrationOptions;
    browserOptions.hints = ["hybrid", "security-key"];
    browserOptions.transports = EXTERNAL_AUTHENTICATOR_TRANSPORTS;
  }

  await createWebAuthnCeremony({ challenge: options.challenge, flow: "REGISTRATION", userId, browserToken });

  return options;
}

/**
 * 验证注册响应
 */
export async function verifyRegResponse(userId: string, response: RegistrationResponseJSON, browserToken: string) {
  const challengeRow = await consumeWebAuthnCeremony({ flow: "REGISTRATION", userId, browserToken });

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challengeRow.challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("注册验证失败");
  }

  const { credential } = verification.registrationInfo;

  // 保存凭证
  await prisma.webAuthnCredential.create({
    data: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64"),
      counter: BigInt(credential.counter),
      credentialType: "public-key",
      authenticatorType: "platform",
      deviceName: "通行密匙",
    },
  });

  return { verified: true };
}

/**
 * 生成认证选项
 */
export async function generateAuthOptions(browserToken: string, mode?: "platform" | "hybrid") {
  const credentials = await prisma.webAuthnCredential.findMany();

  const allowCredentials: PublicKeyCredentialDescriptorJSON[] = credentials.map((cred) => ({
    id: cred.credentialId,
    type: "public-key",
    // Edge/Chrome 需要 transports 才更容易出现手机扫码 / 外部设备入口
    transports: EXTERNAL_AUTHENTICATOR_TRANSPORTS,
  }));

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "required",
    allowCredentials,
  });

  if (mode === "hybrid") {
    // SimpleWebAuthn 类型已暴露 hints；注入给 Chromium/Edge 使用
    const browserOptions = options as PublicKeyCredentialRequestOptionsJSON;
    browserOptions.hints = ["hybrid", "security-key"];
  }

  await createWebAuthnCeremony({ challenge: options.challenge, flow: "AUTHENTICATION", browserToken });

  return options;
}

/**
 * 验证认证响应
 */
export async function verifyAuthResponse(
  response: AuthenticationResponseJSON,
  browserToken: string,
  options: { ipAddress?: string | null; userAgent?: string | null; rememberDevice?: boolean } = {},
) {
  // Read, but do not consume, before cryptographic verification. Consumption is
  // committed only together with counter advancement and session creation.
  const challengeRow = await getWebAuthnCeremony({ flow: "AUTHENTICATION", browserToken });
  const credential = await prisma.webAuthnCredential.findUnique({
    where: { credentialId: response.id },
    include: { user: { select: { status: true, role: true, securityVersion: true } } },
  });
  if (!credential || credential.user.status !== "ACTIVE" || !["ADMIN", "MEMBER"].includes(credential.user.role)) {
    throw new Error("凭证不存在");
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challengeRow.challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: credential.credentialId,
      publicKey: Buffer.from(credential.publicKey, "base64"),
      counter: Number(credential.counter),
    },
    requireUserVerification: true,
  });
  if (!verification.verified) throw new Error("认证验证失败");

  const sessionIssue = issueSessionToken();
  const trustedIssue = options.rememberDevice ? issueTrustedDeviceToken() : null;
  await prisma.$transaction(async (tx) => {
    await consumeWebAuthnCeremonyInTransaction(tx, challengeRow);
    const counterUpdate = await tx.webAuthnCredential.updateMany({
      where: { id: credential.id, counter: credential.counter },
      data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
    });
    if (counterUpdate.count !== 1) throw new Error("WebAuthn counter changed during concurrent authentication");

    await createSessionInTransaction(tx, {
      userId: credential.userId,
      authMethod: "passkey",
      securityVersion: credential.user.securityVersion,
      issue: sessionIssue,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
    });
    if (trustedIssue) {
      await createTrustedDeviceInTransaction(tx, {
        userId: credential.userId,
        securityVersion: credential.user.securityVersion,
        tokenHash: trustedIssue.tokenHash,
        expiresAt: trustedIssue.expiresAt,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
      });
    }
  });

  return { verified: true, userId: credential.userId, sessionToken: sessionIssue.token, trustedToken: trustedIssue?.token ?? null };
}

/**
 * 获取已注册的凭证列表
 */
export async function getRegisteredCredentials(userId: string) {
  return prisma.webAuthnCredential.findMany({
    where: { userId },
    select: {
      id: true,
      credentialId: true,
      deviceName: true,
      authenticatorType: true,
      createdAt: true,
      lastUsedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * 删除凭证
 */
export class LastAuthenticationFactorError extends Error {
  constructor() {
    super("Cannot delete the last authentication factor");
    this.name = "LastAuthenticationFactorError";
  }
}

export async function deleteCredential(userId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const credential = await tx.webAuthnCredential.findFirst({ where: { id, userId }, select: { id: true } });
    if (!credential) throw new Error("WebAuthn credential not found");

    const otherCredentialCount = await tx.webAuthnCredential.count({ where: { userId, id: { not: id } } });
    const totpFactor = await tx.userTotpFactor.findUnique({ where: { userId }, select: { revokedAt: true } });
    if (otherCredentialCount === 0 && (!totpFactor || totpFactor.revokedAt !== null)) {
      throw new LastAuthenticationFactorError();
    }

    return tx.webAuthnCredential.delete({ where: { id, userId } });
  });
}
