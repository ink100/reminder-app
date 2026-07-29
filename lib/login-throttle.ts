import crypto from "node:crypto";
import { isIP } from "node:net";
import type { Prisma } from "@prisma/client";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const OTP_WINDOW_MS = 10 * 60_000;
const THROTTLE_RETENTION_MS = 24 * 60 * 60_000;
const CLEANUP_BATCH_SIZE = 100;
const ACCOUNT_MAX_FAILURES = 5;
const IP_MAX_FAILURES = 25;

export type AnonymousAuthAction = "PASSKEY_OPTIONS" | "PASSKEY_VERIFY";
type Bucket = { key: string; scope: string; maximum: number; windowMs: number };

function digest(value: string) {
  return crypto.createHmac("sha256", env.SESSION_SECRET).update(`login-throttle:${value}`).digest("hex");
}

function loginBuckets(username: string, trustedIp: string | null | undefined): Bucket[] {
  const normalized = username.trim().toLocaleLowerCase();
  const result: Bucket[] = [{ key: `account:${digest(normalized)}`, scope: "ACCOUNT", maximum: ACCOUNT_MAX_FAILURES, windowMs: OTP_WINDOW_MS }];
  if (trustedIp && isIP(trustedIp)) {
    result.push({ key: `ip:${digest(trustedIp)}`, scope: "IP", maximum: IP_MAX_FAILURES, windowMs: OTP_WINDOW_MS });
  }
  return result;
}

function anonymousBucket(action: AnonymousAuthAction, trustedIp: string | null | undefined): Bucket {
  const trusted = trustedIp && isIP(trustedIp) ? trustedIp : null;
  // A missing trusted address deliberately shares a short, relatively high-capacity
  // bucket. It limits anonymous CPU/storage abuse but resets every minute, so one
  // spoofed/untrusted client cannot leave the entire site permanently locked.
  const global = !trusted;
  const maximum = action === "PASSKEY_OPTIONS" ? (global ? 120 : 30) : (global ? 60 : 15);
  return {
    key: `passkey:${action.toLowerCase()}:${global ? "global" : digest(trusted)}`,
    scope: `${action}_${global ? "GLOBAL" : "IP"}`,
    maximum,
    windowMs: global ? 60_000 : OTP_WINDOW_MS,
  };
}

/** Proxy-derived addresses are accepted only under explicit deployment configuration. */
export function getTrustedClientIp(headers: Pick<Headers, "get">) {
  if (!env.TRUST_PROXY_HEADERS) return null;
  const candidate = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim();
  return candidate && isIP(candidate) ? candidate : null;
}

async function cleanupStaleThrottlesInTransaction(tx: Prisma.TransactionClient, now: Date) {
  const stale = await tx.loginThrottle.findMany({
    where: { updatedAt: { lte: new Date(now.getTime() - THROTTLE_RETENTION_MS) } },
    orderBy: { updatedAt: "asc" },
    select: { key: true },
    take: CLEANUP_BATCH_SIZE,
  });
  if (stale.length === 0) return 0;
  const deleted = await tx.loginThrottle.deleteMany({ where: { key: { in: stale.map(({ key }) => key) } } });
  return deleted.count;
}

async function reserveBuckets(tx: Prisma.TransactionClient, requested: Bucket[], now: Date) {
  let allowed = true;
  for (const bucket of requested) {
    const cutoff = new Date(now.getTime() - bucket.windowMs);
    const rows = await tx.$queryRaw<Array<{ failureCount: number | bigint }>>`
      INSERT INTO "LoginThrottle" ("key", "scope", "failureCount", "windowStartedAt", "updatedAt")
      VALUES (${bucket.key}, ${bucket.scope}, 1, ${now}, ${now})
      ON CONFLICT("key") DO UPDATE SET
        "scope" = excluded."scope",
        "failureCount" = CASE WHEN "windowStartedAt" <= ${cutoff} THEN 1 ELSE "failureCount" + 1 END,
        "windowStartedAt" = CASE WHEN "windowStartedAt" <= ${cutoff} THEN ${now} ELSE "windowStartedAt" END,
        "updatedAt" = ${now}
      RETURNING "failureCount"
    `;
    if (Number(rows[0]?.failureCount ?? Number.MAX_SAFE_INTEGER) > bucket.maximum) allowed = false;
  }
  return allowed;
}

export async function reserveLoginAttempt(username: string, trustedIp?: string | null, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await cleanupStaleThrottlesInTransaction(tx, now);
    // Cleanup and both account/IP reservations share one database transaction.
    return reserveBuckets(tx, loginBuckets(username, trustedIp), now);
  });
}

export async function reserveAnonymousAuthAttempt(action: AnonymousAuthAction, trustedIp?: string | null, now = new Date()) {
  return prisma.$transaction((tx) => reserveBuckets(tx, [anonymousBucket(action, trustedIp)], now));
}

export async function recordLoginSuccess(username: string, trustedIp?: string | null) {
  // Authentication proves the account credential, not that a shared IP is safe.
  const accountKeys = loginBuckets(username, trustedIp).filter((bucket) => bucket.scope === "ACCOUNT").map((bucket) => bucket.key);
  return prisma.loginThrottle.deleteMany({ where: { key: { in: accountKeys } } });
}

export const authArtifactRetention = {
  throttleMs: THROTTLE_RETENTION_MS,
  cleanupBatchSize: CLEANUP_BATCH_SIZE,
} as const;
