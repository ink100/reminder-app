import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";

import { env } from "@/lib/env";
import { authArtifactRetention } from "@/lib/login-throttle";
import { prisma } from "@/lib/prisma";

export type WebAuthnFlow = "REGISTRATION" | "AUTHENTICATION";

type CeremonyInput = { ceremonyId: string; flow: WebAuthnFlow; userId?: string | null; browserToken: string };

const CHALLENGE_CLEANUP_BATCH_SIZE = 100;
const MAX_ACTIVE_PER_BROWSER_FLOW = 2;

export function hashCeremonyCookie(token: string) {
  return crypto.createHmac("sha256", env.SESSION_SECRET).update("webauthn-ceremony\0").update(token).digest("hex");
}

async function cleanupExpiredChallenges(tx: Prisma.TransactionClient, now: Date) {
  // expiresAt is indexed. Selecting IDs first keeps every delete bounded.
  const expired = await tx.webAuthnChallenge.findMany({
    where: { expiresAt: { lte: now } },
    orderBy: { expiresAt: "asc" },
    select: { id: true },
    take: CHALLENGE_CLEANUP_BATCH_SIZE,
  });
  if (expired.length === 0) return 0;
  const deleted = await tx.webAuthnChallenge.deleteMany({ where: { id: { in: expired.map(({ id }) => id) } } });
  return deleted.count;
}

export async function createWebAuthnCeremony(input: { challenge: string; flow: WebAuthnFlow; userId?: string | null; browserToken: string; expiresAt?: Date }) {
  const now = new Date();
  const browserTokenHash = hashCeremonyCookie(input.browserToken);
  return prisma.$transaction(async (tx) => {
    await cleanupExpiredChallenges(tx, now);

    if (input.flow === "AUTHENTICATION") {
      // A browser profile has one session cookie, so only its newest login may commit.
      await tx.webAuthnChallenge.updateMany({
        where: { browserTokenHash, flow: input.flow, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
    } else {
      const active = await tx.webAuthnChallenge.findMany({
        where: { browserTokenHash, flow: input.flow, userId: input.userId ?? null, consumedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
        select: { id: true },
        take: MAX_ACTIVE_PER_BROWSER_FLOW + CHALLENGE_CLEANUP_BATCH_SIZE,
      });
      const superseded = active.slice(MAX_ACTIVE_PER_BROWSER_FLOW - 1);
      if (superseded.length > 0) {
        await tx.webAuthnChallenge.deleteMany({ where: { id: { in: superseded.map(({ id }) => id) } } });
      }
    }

    return tx.webAuthnChallenge.create({
      data: {
        id: crypto.randomUUID(),
        challenge: input.challenge,
        flow: input.flow,
        userId: input.userId ?? null,
        browserTokenHash,
        expiresAt: input.expiresAt ?? new Date(now.getTime() + 5 * 60_000),
      },
    });
  });
}

/** Scheduler-safe, bounded cleanup. Returns counts only; no secret identifiers are logged. */
export async function cleanupAuthArtifacts(now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const challenges = await cleanupExpiredChallenges(tx, now);
    const staleThrottle = await tx.loginThrottle.findMany({
      where: { updatedAt: { lte: new Date(now.getTime() - authArtifactRetention.throttleMs) } },
      orderBy: { updatedAt: "asc" },
      select: { key: true },
      take: authArtifactRetention.cleanupBatchSize,
    });
    const throttles = staleThrottle.length === 0
      ? 0
      : (await tx.loginThrottle.deleteMany({ where: { key: { in: staleThrottle.map(({ key }) => key) } } })).count;
    const staleEnrollments = await tx.pendingTotpEnrollment.findMany({
      where: { OR: [{ expiresAt: { lte: now } }, { consumedAt: { not: null } }] },
      orderBy: { expiresAt: "asc" },
      select: { id: true },
      take: CHALLENGE_CLEANUP_BATCH_SIZE,
    });
    const pendingTotpEnrollments = staleEnrollments.length === 0
      ? 0
      : (await tx.pendingTotpEnrollment.deleteMany({ where: { id: { in: staleEnrollments.map(({ id }) => id) } } })).count;
    return { challenges, throttles, pendingTotpEnrollments };
  });
}

function ceremonyWhere(input: CeremonyInput, now: Date) {
  return {
    id: input.ceremonyId,
    flow: input.flow,
    userId: input.userId ?? null,
    browserTokenHash: hashCeremonyCookie(input.browserToken),
    consumedAt: null,
    expiresAt: { gt: now },
  };
}

/** Reads the challenge for cryptographic verification without consuming it. */
export async function getWebAuthnCeremony(input: CeremonyInput, now = new Date()) {
  const row = await prisma.webAuthnChallenge.findFirst({ where: ceremonyWhere(input, now) });
  if (!row) throw new Error("WebAuthn ceremony is invalid, expired, or used");
  return row;
}

export async function consumeWebAuthnCeremonyInTransaction(tx: Prisma.TransactionClient, row: { id: string }, now = new Date()) {
  const consumed = await tx.webAuthnChallenge.updateMany({
    where: { id: row.id, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) throw new Error("WebAuthn ceremony is invalid, expired, or used");
}

export async function consumeWebAuthnCeremony(input: CeremonyInput, now = new Date()) {
  const row = await prisma.webAuthnChallenge.findFirst({ where: ceremonyWhere(input, now) });
  if (!row) throw new Error("WebAuthn ceremony is invalid, expired, or used");
  await consumeWebAuthnCeremonyInTransaction(prisma as unknown as Prisma.TransactionClient, row, now);
  return row;
}
