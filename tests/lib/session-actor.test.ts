import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }));
const prismaMock = vi.hoisted(() => ({ authSession: { create: vi.fn(), findFirst: vi.fn() } }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/env", () => ({ env: { SESSION_SECRET: "test-session-secret-long", APP_BASE_URL: "https://example.test" } }));

import { createSession, getCurrentSession } from "@/lib/session";

describe("user-owned sessions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists userId and authMethod with the new creation signature", async () => {
    await createSession("user-1", "totp", "127.0.0.1", "vitest");
    expect(prismaMock.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", authMethod: "totp", ipAddress: "127.0.0.1", userAgent: "vitest" }),
    });
  });

  it("returns a session Actor including its current user", async () => {
    cookieStore.get.mockReturnValue({ value: "token" });
    prismaMock.authSession.findFirst.mockResolvedValue({ id: "session-1", userId: "user-1", user: { id: "user-1", role: "ADMIN", status: "ACTIVE" } });
    const actor = await getCurrentSession();
    expect(prismaMock.authSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      include: { user: true },
      where: expect.objectContaining({ user: { status: "ACTIVE" } }),
    }));
    expect(actor?.user.role).toBe("ADMIN");
  });
});
