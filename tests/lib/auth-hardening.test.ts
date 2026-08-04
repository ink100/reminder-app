import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), updateMany: vi.fn() },
  authSession: { create: vi.fn(), findFirst: vi.fn() },
  trustedDevice: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/env", () => ({ env: { SESSION_SECRET: "test-session-secret-long", APP_BASE_URL: "https://example.test" } }));

import { TRUSTED_DEVICE_COOKIE_NAME } from "@/lib/constants/auth";
import { getResponseCookies } from "@/lib/http/cookies";
import { createSession } from "@/lib/session";
import { createTrustedDevice, getValidTrustedDevice } from "@/lib/trusted-device";
import { runWithRequestContext } from "@/server/context/request-context";

function withRequestContext<T>(callback: () => T, cookie = ""): T {
  return runWithRequestContext(new Request("https://example.test/test", {
    headers: { cookie },
  }), callback);
}

describe("inactive principal hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
  });
  it.each(["INVITED", "DISABLED"])("createSession fails closed for %s users", async (status) => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status, role: "MEMBER", securityVersion: 1 });
    await withRequestContext(async () => {
      await expect(createSession("u1", "passkey")).rejects.toThrow(/inactive/i);
      expect(prismaMock.authSession.create).not.toHaveBeenCalled();
    });
  });
  it("trusted device creation fails closed for inactive users", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "DISABLED", securityVersion: 1 });
    await withRequestContext(async () => {
      await expect(createTrustedDevice("u1")).rejects.toThrow(/inactive/i);
      expect(prismaMock.trustedDevice.create).not.toHaveBeenCalled();
    });
  });
  it("stores the current version and rejects a late trusted-device create", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "MEMBER", securityVersion: 4 });
    await withRequestContext(async () => {
      await createTrustedDevice("u1");
      expect(prismaMock.trustedDevice.create).toHaveBeenCalledWith({ data: expect.objectContaining({ securityVersion: 4 }) });
    });

    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", status: "ACTIVE", role: "MEMBER", securityVersion: 4 });
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 });
    await withRequestContext(async () => {
      await expect(createTrustedDevice("u1")).rejects.toThrow(/changed|inactive/i);
      expect(prismaMock.trustedDevice.create).not.toHaveBeenCalled();
    });
  });
  it("rejects a stale trusted device after re-enable", async () => {
    prismaMock.trustedDevice.findFirst.mockResolvedValue({ id: "d1", securityVersion: 3, user: { status: "ACTIVE", securityVersion: 4 } });
    await withRequestContext(async () => {
      await expect(getValidTrustedDevice()).resolves.toBeNull();
      expect(getResponseCookies()).toEqual([
        `${TRUSTED_DEVICE_COOKIE_NAME}=; Path=/; Max-Age=0`,
        `${TRUSTED_DEVICE_COOKIE_NAME}=; Path=/; Domain=example.test; Max-Age=0`,
      ]);
      expect(prismaMock.trustedDevice.update).not.toHaveBeenCalled();
    }, `${TRUSTED_DEVICE_COOKIE_NAME}=token`);
  });
});
