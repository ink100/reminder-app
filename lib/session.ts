import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/constants/auth";
import { deleteResponseCookie, getRequestCookie, setResponseCookie } from "@/lib/http/cookies";

export function hashSessionToken(token: string) {
  return crypto.createHmac("sha256", env.SESSION_SECRET).update(token).digest("hex");
}

export function issueSessionToken(now = new Date()) {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000),
  };
}

export async function setSessionCookie(token: string) {
  setResponseCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true, sameSite: "lax", secure: env.APP_BASE_URL.startsWith("https://"), path: "/", maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export type AuthMethod = "totp" | "passkey" | "trusted_device";

export type SessionIssue = ReturnType<typeof issueSessionToken>;

export async function createSessionInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    authMethod: AuthMethod;
    securityVersion: number;
    issue: SessionIssue;
    ipAddress?: string | null;
    userAgent?: string | null;
    trustedDeviceId?: string | null;
  },
) {
  const current = await tx.user.updateMany({
    where: {
      id: input.userId,
      status: "ACTIVE",
      role: { in: ["ADMIN", "MEMBER"] },
      securityVersion: input.securityVersion,
    },
    data: { securityVersion: { increment: 0 } },
  });
  if (current.count !== 1) throw new Error("User became inactive, unauthorized, or security version changed");
  return tx.authSession.create({
    data: {
      userId: input.userId,
      authMethod: input.authMethod,
      securityVersion: input.securityVersion,
      sessionTokenHash: input.issue.tokenHash,
      expiresAt: input.issue.expiresAt,
      ipAddress: input.ipAddress ?? undefined,
      userAgent: input.userAgent ?? undefined,
      trustedDeviceId: input.trustedDeviceId ?? undefined,
    },
  });
}

export async function createSession(userId: string, authMethod: AuthMethod, ipAddress?: string | null, userAgent?: string | null) {
  const { token, tokenHash, expiresAt } = issueSessionToken();

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true, role: true, securityVersion: true } });
    if (!user || user.status !== "ACTIVE" || !["ADMIN", "MEMBER"].includes(user.role)) {
      throw new Error("Cannot create session for inactive or unauthorized user");
    }
    await createSessionInTransaction(tx, {
      userId,
      authMethod,
      securityVersion: user.securityVersion,
      issue: { token, tokenHash, expiresAt },
      ipAddress,
      userAgent,
    });
  });

  await setSessionCookie(token);
}

export async function deleteCurrentSession() {
  const token = getRequestCookie(SESSION_COOKIE_NAME);
  if (token) await prisma.authSession.deleteMany({ where: { sessionTokenHash: hashSessionToken(token) } });
  deleteResponseCookie(SESSION_COOKIE_NAME, { path: "/" });
}

export async function getCurrentSession() {
  const token = getRequestCookie(SESSION_COOKIE_NAME);
  if (!token) return null;
  const session = await prisma.authSession.findFirst({
    where: { sessionTokenHash: hashSessionToken(token), expiresAt: { gt: new Date() }, user: { status: "ACTIVE", role: { in: ["ADMIN", "MEMBER"] } } },
    include: { user: true },
  });
  if (!session || session.securityVersion !== session.user.securityVersion) return null;
  return session;
}

export async function clearAllSessions() {
  await prisma.authSession.deleteMany({});
  deleteResponseCookie(SESSION_COOKIE_NAME, { path: "/" });
}
