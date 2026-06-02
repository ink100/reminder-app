import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";

// 应用名称和域名配置
const RP_NAME = "到期提醒";
const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";
const ORIGIN = process.env.WEBAUTHN_ORIGIN || process.env.APP_BASE_URL || "http://localhost:63456";

/**
 * 生成注册选项
 */
export async function generateRegOptions(authenticatorAttachment?: "platform" | "cross-platform") {
  // 获取已注册的凭证
  const existingCredentials = await prisma.webAuthnCredential.findMany({
    select: {
      credentialId: true,
    },
  });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: "admin",
    userDisplayName: "管理员",
    attestationType: "none",
    excludeCredentials: existingCredentials.map((cred) => ({
      id: cred.credentialId,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      ...(authenticatorAttachment ? { authenticatorAttachment } : {}),
    },
  });

  // 添加 hints 提示浏览器显示手机扫码选项
  if (authenticatorAttachment === "cross-platform") {
    (options as any).hints = ["hybrid", "security-key"];
    (options as any).transports = ["hybrid", "internal", "usb", "ble", "nfc"];
  }

  // 临时存储 challenge
  await prisma.webAuthnChallenge.upsert({
    where: { id: "current" },
    update: { challenge: options.challenge, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
    create: { id: "current", challenge: options.challenge, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
  });

  return options;
}

/**
 * 验证注册响应
 */
export async function verifyRegResponse(response: RegistrationResponseJSON) {
  // 获取存储的 challenge
  const challengeRow = await prisma.webAuthnChallenge.findUnique({
    where: { id: "current" },
  });

  if (!challengeRow || challengeRow.expiresAt < new Date()) {
    throw new Error("Challenge 已过期或不存在");
  }

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
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64"),
      counter: BigInt(credential.counter),
      credentialType: "public-key",
      authenticatorType: "platform",
      deviceName: "通行密匙",
    },
  });

  // 清除 challenge
  await prisma.webAuthnChallenge.delete({ where: { id: "current" } }).catch(() => {});

  return { verified: true };
}

/**
 * 生成认证选项
 */
export async function generateAuthOptions(mode?: "platform" | "hybrid") {
  const credentials = await prisma.webAuthnCredential.findMany();

  const allowCredentials = credentials.map((cred) => ({
    id: cred.credentialId,
    // Edge/Chrome 需要 transports 才更容易出现手机扫码 / 外部设备入口
    transports: ["internal", "hybrid", "usb", "ble", "nfc"],
  }));

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "preferred",
    allowCredentials: allowCredentials as any,
  });

  if (mode === "hybrid") {
    // SimpleWebAuthn 类型暂未完整暴露 hints；手动注入给 Chromium/Edge 使用
    (options as any).hints = ["hybrid", "security-key"];
  }

  // 临时存储 challenge
  await prisma.webAuthnChallenge.upsert({
    where: { id: "auth" },
    update: { challenge: options.challenge, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
    create: { id: "auth", challenge: options.challenge, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
  });

  return options;
}

/**
 * 验证认证响应
 */
export async function verifyAuthResponse(response: AuthenticationResponseJSON) {
  // 获取存储的 challenge
  const challengeRow = await prisma.webAuthnChallenge.findUnique({
    where: { id: "auth" },
  });

  if (!challengeRow || challengeRow.expiresAt < new Date()) {
    throw new Error("Challenge 已过期或不存在");
  }

  // 查找凭证
  const credential = await prisma.webAuthnCredential.findUnique({
    where: { credentialId: response.id },
  });

  if (!credential) {
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
  });

  if (!verification.verified) {
    throw new Error("认证验证失败");
  }

  // 更新计数器
  await prisma.webAuthnCredential.update({
    where: { credentialId: response.id },
    data: {
      counter: BigInt(verification.authenticationInfo.newCounter),
      lastUsedAt: new Date(),
    },
  });

  // 清除 challenge
  await prisma.webAuthnChallenge.delete({ where: { id: "auth" } }).catch(() => {});

  return { verified: true };
}

/**
 * 获取已注册的凭证列表
 */
export async function getRegisteredCredentials() {
  return prisma.webAuthnCredential.findMany({
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
export async function deleteCredential(id: string) {
  return prisma.webAuthnCredential.delete({ where: { id } });
}
