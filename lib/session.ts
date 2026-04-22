import crypto from "node:crypto";

import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/constants/auth";

function hashToken(token: string) {
  return crypto
    .createHmac("sha256", env.SESSION_SECRET)
    .update(token)
    .digest("hex");
}

export async function createSession(ipAddress?: string | null, userAgent?: string | null) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.authSession.create({
    data: {
      sessionTokenHash: tokenHash,
      expiresAt,
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.APP_BASE_URL.startsWith("https://"),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await prisma.authSession.deleteMany({
      where: { sessionTokenHash: hashToken(token) },
    });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = await prisma.authSession.findFirst({
    where: {
      sessionTokenHash: hashToken(token),
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  return session;
}

export async function clearAllSessions() {
  await prisma.authSession.deleteMany({});
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
