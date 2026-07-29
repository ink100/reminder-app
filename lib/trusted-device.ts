import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, TRUSTED_DEVICE_COOKIE_NAME, TRUSTED_DEVICE_MAX_AGE_SECONDS } from "@/lib/constants/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createSessionInTransaction, hashSessionToken, issueSessionToken, setSessionCookie } from "@/lib/session";

export function hashTrustedDeviceToken(token: string) {
  return crypto.createHmac("sha256", env.SESSION_SECRET).update(`trusted-device:${token}`).digest("hex");
}

export function issueTrustedDeviceToken(now = new Date()) {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashTrustedDeviceToken(token),
    expiresAt: new Date(now.getTime() + TRUSTED_DEVICE_MAX_AGE_SECONDS * 1000),
  };
}

function getDeviceName(userAgent?: string | null) {
  const ua = userAgent ?? "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone / iPad";
  if (/Android/i.test(ua)) return "Android 设备";
  if (/Windows/i.test(ua)) return "Windows 电脑";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac 电脑";
  if (/Linux/i.test(ua)) return "Linux 设备";
  return "可信设备";
}

export async function setTrustedDeviceCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(TRUSTED_DEVICE_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.APP_BASE_URL.startsWith("https://"),
    path: "/",
    maxAge: TRUSTED_DEVICE_MAX_AGE_SECONDS,
  });
}

export async function createTrustedDeviceInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    securityVersion: number;
    tokenHash: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
) {
  return tx.trustedDevice.create({
    data: {
      userId: input.userId,
      securityVersion: input.securityVersion,
      tokenHash: input.tokenHash,
      deviceName: getDeviceName(input.userAgent),
      userAgent: input.userAgent ?? undefined,
      ipAddress: input.ipAddress ?? undefined,
      expiresAt: input.expiresAt,
      lastUsedAt: new Date(),
    },
  });
}

export async function createTrustedDevice(userId: string, ipAddress?: string | null, userAgent?: string | null) {
  const issue = issueTrustedDeviceToken();
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true, role: true, securityVersion: true } });
    if (!user || user.status !== "ACTIVE" || !["ADMIN", "MEMBER"].includes(user.role)) {
      throw new Error("Cannot trust a device for an inactive or unauthorized user");
    }
    const current = await tx.user.updateMany({
      where: { id: userId, status: "ACTIVE", role: { in: ["ADMIN", "MEMBER"] }, securityVersion: user.securityVersion },
      data: { securityVersion: { increment: 0 } },
    });
    if (current.count !== 1) throw new Error("User became inactive or security version changed");
    await createTrustedDeviceInTransaction(tx, {
      userId,
      securityVersion: user.securityVersion,
      tokenHash: issue.tokenHash,
      expiresAt: issue.expiresAt,
      ipAddress,
      userAgent,
    });
  });
  await setTrustedDeviceCookie(issue.token);
}

export async function getValidTrustedDevice() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TRUSTED_DEVICE_COOKIE_NAME)?.value;
  if (!token) return null;
  const device = await prisma.trustedDevice.findFirst({
    where: { tokenHash: hashTrustedDeviceToken(token), revokedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  });
  if (!device || device.user.status !== "ACTIVE" || !["ADMIN", "MEMBER"].includes(device.user.role)
    || device.securityVersion !== device.user.securityVersion) {
    cookieStore.delete(TRUSTED_DEVICE_COOKIE_NAME);
    return null;
  }
  await prisma.trustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
  return device;
}

/** Atomically rotates a valid trusted token and creates its derived session. */
export async function restoreSessionFromTrustedDevice(ipAddress?: string | null, userAgent?: string | null) {
  const cookieStore = await cookies();
  const trustedToken = cookieStore.get(TRUSTED_DEVICE_COOKIE_NAME)?.value;
  if (!trustedToken) return { status: "missing" as const };
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  const now = new Date();
  const oldTokenHash = hashTrustedDeviceToken(trustedToken);
  const trustedIssue = issueTrustedDeviceToken(now);
  const sessionIssue = issueSessionToken(now);
  const result = await prisma.$transaction(async (tx) => {
    if (sessionToken) {
      const currentSession = await tx.authSession.findUnique({
        where: { sessionTokenHash: hashSessionToken(sessionToken) },
        include: { user: true },
      });
      if (currentSession
        && currentSession.expiresAt > now
        && currentSession.user.status === "ACTIVE"
        && ["ADMIN", "MEMBER"].includes(currentSession.user.role)
        && currentSession.securityVersion === currentSession.user.securityVersion) {
        return { status: "session_present" as const };
      }
    }

    const candidate = await tx.trustedDevice.findFirst({
      where: { tokenHash: oldTokenHash, revokedAt: null, expiresAt: { gt: now } },
      include: { user: true },
    });
    if (!candidate || candidate.user.status !== "ACTIVE" || !["ADMIN", "MEMBER"].includes(candidate.user.role)
      || candidate.securityVersion !== candidate.user.securityVersion) return { status: "invalid" as const };

    const rotated = await tx.trustedDevice.updateMany({
      where: {
        id: candidate.id,
        tokenHash: oldTokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
        securityVersion: candidate.securityVersion,
      },
      // Preserve the old hash on a revoked row so an in-flight logout carrying
      // that token can still resolve the account after this restore commits.
      data: { revokedAt: now, lastUsedAt: now },
    });
    // A CAS loser must not touch the shared browser cookie jar: the winning
    // response may already have installed its newly rotated token.
    if (rotated.count !== 1) return { status: "conflict" as const };

    const replacement = await createTrustedDeviceInTransaction(tx, {
      userId: candidate.userId,
      securityVersion: candidate.securityVersion,
      tokenHash: trustedIssue.tokenHash,
      expiresAt: trustedIssue.expiresAt,
      ipAddress,
      userAgent,
    });
    await createSessionInTransaction(tx, {
      userId: candidate.userId,
      authMethod: "trusted_device",
      securityVersion: candidate.securityVersion,
      issue: sessionIssue,
      ipAddress,
      userAgent,
      trustedDeviceId: replacement.id,
    });
    return { status: "restored" as const, device: candidate };
  });

  if (result.status !== "restored") return result;
  // Neither credential is exposed until both database writes commit.
  await setTrustedDeviceCookie(trustedIssue.token);
  await setSessionCookie(sessionIssue.token);
  return result;
}

export async function hasTrustedDeviceCookie() {
  const cookieStore = await cookies();
  return Boolean(cookieStore.get(TRUSTED_DEVICE_COOKIE_NAME)?.value);
}

export async function deleteTrustedDeviceCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(TRUSTED_DEVICE_COOKIE_NAME);
}

export async function listTrustedDevices(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { securityVersion: true } });
  if (!user) return [];
  return prisma.trustedDevice.findMany({
    where: { userId, securityVersion: user.securityVersion, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, deviceName: true, userAgent: true, ipAddress: true, expiresAt: true, lastUsedAt: true, createdAt: true },
  });
}

export async function revokeTrustedDevice(userId: string, id: string) {
  const device = await prisma.$transaction(async (tx) => {
    const revoked = await tx.trustedDevice.update({ where: { id, userId }, data: { revokedAt: new Date() } });
    await tx.authSession.deleteMany({ where: { trustedDeviceId: id } });
    return revoked;
  });
  const cookieStore = await cookies();
  const currentToken = cookieStore.get(TRUSTED_DEVICE_COOKIE_NAME)?.value;
  if (currentToken && hashTrustedDeviceToken(currentToken) === device.tokenHash) cookieStore.delete(TRUSTED_DEVICE_COOKIE_NAME);
  return device;
}

/** Atomically invalidates every session and trusted device for the cookie-resolved account. */
export async function logoutCurrentDevice() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const trustedToken = cookieStore.get(TRUSTED_DEVICE_COOKIE_NAME)?.value;
  await prisma.$transaction(async (tx) => {
    const session = sessionToken ? await tx.authSession.findUnique({
      where: { sessionTokenHash: hashSessionToken(sessionToken) },
      select: { userId: true, user: { select: { securityVersion: true } } },
    }) : null;
    const device = trustedToken ? await tx.trustedDevice.findFirst({
      where: { tokenHash: hashTrustedDeviceToken(trustedToken) },
      include: { user: { select: { securityVersion: true } } },
    }) : null;
    const owners = new Map<string, number>();
    if (session) owners.set(session.userId, session.user.securityVersion);
    if (device) owners.set(device.userId, device.user.securityVersion);

    for (const [userId, securityVersion] of owners) {
      const invalidated = await tx.user.updateMany({
        where: { id: userId, securityVersion },
        data: { securityVersion: { increment: 1 } },
      });
      // A CAS loser raced another whole-account invalidation; that winner already
      // makes every old credential unusable. The deletes remain idempotent.
      if (invalidated.count === 1) {
        await tx.authSession.deleteMany({ where: { userId } });
        await tx.trustedDevice.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
    }
  });
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete(TRUSTED_DEVICE_COOKIE_NAME);
}
