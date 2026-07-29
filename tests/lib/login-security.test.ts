import { beforeEach, describe, expect, it, vi } from "vitest";

const txMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  loginThrottle: { findMany: vi.fn(), deleteMany: vi.fn() },
}));
const prismaMock = vi.hoisted(() => ({
  loginThrottle: { deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/env", () => ({ env: { SESSION_SECRET: "test-session-secret-long", TRUST_PROXY_HEADERS: false } }));

import { getTrustedClientIp, recordLoginSuccess, reserveAnonymousAuthAttempt, reserveLoginAttempt } from "@/lib/login-throttle";
import { selfSecurityAuthorizationStatus } from "@/lib/self-security";

describe("durable generic login throttling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (work: (tx: typeof txMock) => unknown) => work(txMock));
    txMock.loginThrottle.findMany.mockResolvedValue([]);
    txMock.loginThrottle.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("atomically reserves attempts and always enforces an account bucket", async () => {
    txMock.$queryRaw.mockResolvedValue([{ failureCount: 6 }]);
    await expect(reserveLoginAttempt(" Alice ", null, new Date(2_000))).resolves.toBe(false);
    expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(txMock.loginThrottle.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: expect.any(Number) }));
  });

  it("admits no more than five concurrent account attempts", async () => {
    let count = 0;
    txMock.$queryRaw.mockImplementation(async () => [{ failureCount: ++count }]);
    const admitted = await Promise.all(Array.from({ length: 8 }, () => reserveLoginAttempt("alice", null, new Date(2_000))));
    expect(admitted.filter(Boolean)).toHaveLength(5);
    expect(count).toBe(8);
  });

  it("reserves account and trusted-IP dimensions in one transaction", async () => {
    txMock.$queryRaw.mockResolvedValue([{ failureCount: 1 }]);
    await expect(reserveLoginAttempt("alice", "192.0.2.1", new Date(2_000))).resolves.toBe(true);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.$queryRaw).toHaveBeenCalledTimes(2);
    await recordLoginSuccess("alice", "192.0.2.1");
    const deletedKeys = prismaMock.loginThrottle.deleteMany.mock.calls[0]?.[0].where.key.in as string[];
    expect(deletedKeys).toHaveLength(1);
    expect(deletedKeys[0]).toMatch(/^account:/);
  });

  it("boundedly removes old rows after a large random-username attack inside the OTP reservation transaction", async () => {
    const randomRows = Array.from({ length: 500 }, (_, index) => ({ key: `random-${index}` }));
    const ids = randomRows.slice(0, 100);
    txMock.loginThrottle.findMany.mockResolvedValue(ids);
    txMock.$queryRaw.mockResolvedValue([{ failureCount: 1 }]);
    await expect(reserveLoginAttempt("random-username", null, new Date("2026-07-29T10:00:00Z"))).resolves.toBe(true);
    expect(txMock.loginThrottle.deleteMany).toHaveBeenCalledWith({ where: { key: { in: ids.map(({ key }) => key) } } });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("uses durable trusted-IP buckets and a bounded global fallback", async () => {
    txMock.$queryRaw.mockResolvedValue([{ failureCount: 1 }]);
    await expect(reserveAnonymousAuthAttempt("PASSKEY_OPTIONS", "192.0.2.8", new Date(2_000))).resolves.toBe(true);
    await expect(reserveAnonymousAuthAttempt("PASSKEY_VERIFY", null, new Date(2_000))).resolves.toBe(true);
    expect(txMock.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("eventually admits anonymous no-trusted-IP traffic after the global window rolls", async () => {
    txMock.$queryRaw.mockResolvedValueOnce([{ failureCount: 61 }]).mockResolvedValueOnce([{ failureCount: 1 }]);
    await expect(reserveAnonymousAuthAttempt("PASSKEY_VERIFY", null, new Date(2_000))).resolves.toBe(false);
    await expect(reserveAnonymousAuthAttempt("PASSKEY_VERIFY", null, new Date(62_001))).resolves.toBe(true);
  });

  it("ignores spoofable forwarding headers unless proxy trust is explicitly enabled", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.10" });
    expect(getTrustedClientIp(headers)).toBeNull();
  });
});

describe("self-security authorization", () => {
  it.each(["ADMIN", "MEMBER"])("allows an authenticated %s to manage only their own security", (role) => {
    expect(selfSecurityAuthorizationStatus({ userId: "u1", user: { role } }, "u1")).toBeNull();
    expect(selfSecurityAuthorizationStatus({ userId: "u1", user: { role } }, "u2")).toBe(403);
  });
  it("rejects anonymous access", () => expect(selfSecurityAuthorizationStatus(null, "u1")).toBe(401));
});
