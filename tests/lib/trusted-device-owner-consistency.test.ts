import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  authSession: { findUnique: vi.fn(), create: vi.fn() },
  trustedDevice: { findFirst: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
}));
const prisma = vi.hoisted(() => ({ ...tx, $transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/env", () => ({ env: { SESSION_SECRET: "test-session-secret-long", APP_BASE_URL: "https://example.test" } }));

import { SESSION_COOKIE_NAME, TRUSTED_DEVICE_COOKIE_NAME } from "@/lib/constants/auth";
import { getResponseCookies } from "@/lib/http/cookies";
import { restoreSessionFromTrustedDevice } from "@/lib/trusted-device";
import { runWithRequestContext } from "@/server/context/request-context";

describe("trusted-device owner consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));
    tx.authSession.findUnique.mockResolvedValue({
      userId: "user-a", securityVersion: 1, expiresAt: new Date(Date.now() + 60_000),
      user: { status: "ACTIVE", role: "MEMBER", securityVersion: 1 },
    });
    tx.trustedDevice.findFirst.mockResolvedValue({
      id: "device-b", userId: "user-b", securityVersion: 2,
      user: { status: "ACTIVE", role: "MEMBER", securityVersion: 2 },
    });
    tx.trustedDevice.updateMany.mockResolvedValue({ count: 1 });
  });

  it("revokes and clears trusted B instead of reporting session A present", async () => {
    await runWithRequestContext(new Request("https://example.test", { headers: {
      cookie: `${SESSION_COOKIE_NAME}=session-a; ${TRUSTED_DEVICE_COOKIE_NAME}=trusted-b`,
    } }), async () => {
      await expect(restoreSessionFromTrustedDevice()).resolves.toEqual({ status: "owner_mismatch" });
      expect(tx.trustedDevice.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: "device-b", userId: "user-b" }),
        data: { revokedAt: expect.any(Date), lastUsedAt: expect.any(Date) },
      }));
      expect(tx.authSession.create).not.toHaveBeenCalled();
      expect(getResponseCookies()).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`^${TRUSTED_DEVICE_COOKIE_NAME}=; Path=/; Max-Age=0`))]));
    });
  });
});
