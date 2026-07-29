import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  webAuthnChallenge: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
  pendingTotpEnrollment: { findMany: vi.fn(), deleteMany: vi.fn() },
  loginThrottle: { findMany: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/env", () => ({ env: { SESSION_SECRET: "test-secret-at-least-sixteen" } }));

import { cleanupAuthArtifacts, consumeWebAuthnCeremony, createWebAuthnCeremony, hashCeremonyCookie } from "@/lib/webauthn-ceremonies";

describe("WebAuthn ceremony storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (work: (tx: typeof prismaMock) => unknown) => work(prismaMock));
    prismaMock.webAuthnChallenge.findMany.mockResolvedValue([]);
    prismaMock.webAuthnChallenge.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.loginThrottle.findMany.mockResolvedValue([]);
    prismaMock.loginThrottle.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.pendingTotpEnrollment.findMany.mockResolvedValue([]);
    prismaMock.pendingTotpEnrollment.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("isolates random ceremonies by flow, user and browser-bound cookie hash", async () => {
    prismaMock.webAuthnChallenge.create.mockImplementation(async ({ data }: { data: unknown }) => data);
    const first = await createWebAuthnCeremony({ challenge: "challenge-a", flow: "REGISTRATION", userId: "u1", browserToken: "browser-a" });
    const second = await createWebAuthnCeremony({ challenge: "challenge-b", flow: "REGISTRATION", userId: "u1", browserToken: "browser-b" });
    expect(first.id).not.toBe(second.id);
    expect(first.browserTokenHash).toBe(hashCeremonyCookie("browser-a"));
    expect(JSON.stringify(prismaMock.webAuthnChallenge.create.mock.calls)).not.toContain("browser-a");
  });

  it("cleans a bounded expired batch and caps active challenges for the same browser and flow before insert", async () => {
    prismaMock.webAuthnChallenge.findMany
      .mockResolvedValueOnce(Array.from({ length: 100 }, (_, index) => ({ id: `expired-${index}` })))
      .mockResolvedValueOnce([{ id: "active-old-1" }, { id: "active-old-2" }, { id: "active-old-3" }]);
    prismaMock.webAuthnChallenge.create.mockImplementation(async ({ data }: { data: unknown }) => data);
    await createWebAuthnCeremony({ challenge: "new", flow: "AUTHENTICATION", browserToken: "browser" });
    expect(prismaMock.webAuthnChallenge.deleteMany).toHaveBeenCalledWith({ where: { id: { in: expect.arrayContaining(["expired-0", "expired-99"]) } } });
    expect(prismaMock.webAuthnChallenge.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["active-old-2", "active-old-3"] } } });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.webAuthnChallenge.create).toHaveBeenCalledTimes(1);
  });

  it("scheduler cleanup removes large random artifact sets in bounded indexed batches without deleting valid challenges", async () => {
    const randomChallenges = Array.from({ length: 500 }, (_, index) => ({ id: `random-challenge-${index}` }));
    const randomThrottles = Array.from({ length: 500 }, (_, index) => ({ key: `random-account-${index}` }));
    const expired = randomChallenges.slice(0, 100);
    const staleThrottle = randomThrottles.slice(0, 100);
    prismaMock.webAuthnChallenge.findMany.mockResolvedValue(expired);
    prismaMock.loginThrottle.findMany.mockResolvedValue(staleThrottle);
    prismaMock.webAuthnChallenge.deleteMany.mockResolvedValue({ count: 100 });
    prismaMock.loginThrottle.deleteMany.mockResolvedValue({ count: 100 });
    const staleEnrollments = Array.from({ length: 100 }, (_, index) => ({ id: `pending-${index}` }));
    prismaMock.pendingTotpEnrollment.findMany.mockResolvedValue(staleEnrollments);
    prismaMock.pendingTotpEnrollment.deleteMany.mockResolvedValue({ count: 100 });
    await expect(cleanupAuthArtifacts(new Date("2026-07-29T10:00:00Z"))).resolves.toEqual({ challenges: 100, throttles: 100, pendingTotpEnrollments: 100 });
    expect(prismaMock.webAuthnChallenge.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { expiresAt: { lte: expect.any(Date) } }, take: 100 }));
    expect(prismaMock.webAuthnChallenge.deleteMany).toHaveBeenCalledWith({ where: { id: { in: expired.map(({ id }) => id) } } });
    expect(prismaMock.pendingTotpEnrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ expiresAt: { lte: expect.any(Date) } }, { consumedAt: { not: null } }] }, take: 100,
    }));
    expect(prismaMock.pendingTotpEnrollment.deleteMany).toHaveBeenCalledWith({ where: { id: { in: staleEnrollments.map(({ id }) => id) } } });
  });

  it("does not delete a valid unconsumed challenge during cleanup", async () => {
    prismaMock.webAuthnChallenge.findMany.mockResolvedValue([]);
    prismaMock.webAuthnChallenge.findFirst.mockResolvedValue({ id: "valid", challenge: "still-valid" });
    prismaMock.webAuthnChallenge.updateMany.mockResolvedValue({ count: 1 });
    await cleanupAuthArtifacts(new Date("2026-07-29T10:00:00Z"));
    expect(prismaMock.webAuthnChallenge.deleteMany).not.toHaveBeenCalled();
    await expect(consumeWebAuthnCeremony({ flow: "AUTHENTICATION", browserToken: "browser" }, new Date("2026-07-29T10:00:00Z"))).resolves.toEqual(expect.objectContaining({ id: "valid" }));
  });

  it("atomically consumes an unexpired ceremony only once", async () => {
    const row = { id: "c1", challenge: "challenge", flow: "AUTHENTICATION", userId: null, browserTokenHash: hashCeremonyCookie("browser") };
    prismaMock.webAuthnChallenge.findFirst.mockResolvedValue(row);
    prismaMock.webAuthnChallenge.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(consumeWebAuthnCeremony({ flow: "AUTHENTICATION", browserToken: "browser" })).resolves.toEqual(row);
    await expect(consumeWebAuthnCeremony({ flow: "AUTHENTICATION", browserToken: "browser" })).rejects.toThrow(/expired|used|invalid/i);
  });
});
