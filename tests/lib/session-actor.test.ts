import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), updateMany: vi.fn() },
  authSession: { create: vi.fn(), findFirst: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/env", () => ({ env: { SESSION_SECRET: "test-session-secret-long", APP_BASE_URL: "https://example.test" } }));

import { SESSION_COOKIE_NAME } from "@/lib/constants/auth";
import { getResponseCookies } from "@/lib/http/cookies";
import { createSession, getCurrentSession } from "@/lib/session";
import { runWithRequestContext } from "@/server/context/request-context";

function withRequestContext<T>(callback: () => T, cookie = ""): T {
  return runWithRequestContext(new Request("https://example.test/test", {
    headers: { cookie },
  }), callback);
}

describe("user-owned sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));
    prismaMock.user.findUnique.mockResolvedValue({ status: "ACTIVE", role: "ADMIN", securityVersion: 7 });
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
  });

  it("persists userId, auth method and security snapshot", async () => {
    await withRequestContext(async () => {
      await createSession("user-1", "totp", "127.0.0.1", "vitest");
      expect(prismaMock.authSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: "user-1", authMethod: "totp", securityVersion: 7, ipAddress: "127.0.0.1", userAgent: "vitest" }),
      });
    });
  });

  it("returns a session Actor including its current user", async () => {
    prismaMock.authSession.findFirst.mockResolvedValue({ id: "session-1", userId: "user-1", securityVersion: 7, user: { id: "user-1", role: "ADMIN", status: "ACTIVE", securityVersion: 7 } });
    await withRequestContext(async () => {
      const actor = await getCurrentSession();
      expect(prismaMock.authSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        include: { user: true },
        where: expect.objectContaining({ user: { status: "ACTIVE", role: { in: ["ADMIN", "MEMBER"] } } }),
      }));
      expect(actor?.user.role).toBe("ADMIN");
    }, `${SESSION_COOKIE_NAME}=token`);
  });

  it("rejects a stale session snapshot even after the user is active again", async () => {
    prismaMock.authSession.findFirst.mockResolvedValue({ securityVersion: 6, user: { status: "ACTIVE", role: "MEMBER", securityVersion: 7 } });
    await withRequestContext(async () => {
      await expect(getCurrentSession()).resolves.toBeNull();
    }, `${SESSION_COOKIE_NAME}=token`);
  });

  it("does not create a late session when the version changed during revocation", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 });
    await withRequestContext(async () => {
      await expect(createSession("user-1", "totp")).rejects.toThrow(/changed|inactive/i);
      expect(prismaMock.authSession.create).not.toHaveBeenCalled();
      expect(getResponseCookies()).toEqual([]);
    });
  });

  it("refuses to create a session for an active user with an unknown role", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ status: "ACTIVE", role: "UNKNOWN", securityVersion: 7 });
    await withRequestContext(async () => {
      await expect(createSession("user-1", "totp")).rejects.toThrow(/unauthorized/i);
      expect(prismaMock.authSession.create).not.toHaveBeenCalled();
    });
  });
});
