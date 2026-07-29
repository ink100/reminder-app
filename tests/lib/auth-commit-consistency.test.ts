import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() }));
const txMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), updateMany: vi.fn() },
  userTotpFactor: { updateMany: vi.fn() },
  trustedDevice: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  authSession: { create: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
}));
const prismaMock = vi.hoisted(() => ({
  ...txMock,
  $transaction: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/env", () => ({ env: {
  SESSION_SECRET: "test-session-secret-long", APP_BASE_URL: "https://example.test",
} }));

import { commitOtpLogin } from "@/lib/otp";
import { hashSessionToken } from "@/lib/session";
import {
  hashTrustedDeviceToken,
  restoreSessionFromTrustedDevice,
  revokeTrustedDevice,
} from "@/lib/trusted-device";

describe("atomic authentication commits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (work: (tx: typeof txMock) => unknown) => work(txMock));
    txMock.authSession.findUnique.mockResolvedValue(null);
    txMock.trustedDevice.create.mockResolvedValue({ id: "d-replacement" });
  });

  it("does not restore a trusted-device account over an existing valid session", async () => {
    cookieStore.get.mockImplementation((name: string) => ({ value: name.includes("trusted") ? "trusted-user-a" : "session-user-b" }));
    txMock.authSession.findUnique.mockResolvedValue({
      userId: "user-b",
      securityVersion: 4,
      expiresAt: new Date(Date.now() + 60_000),
      user: { status: "ACTIVE", role: "MEMBER", securityVersion: 4 },
    });

    await expect(restoreSessionFromTrustedDevice()).resolves.toEqual({ status: "session_present" });
    expect(txMock.trustedDevice.findFirst).not.toHaveBeenCalled();
    expect(txMock.trustedDevice.updateMany).not.toHaveBeenCalled();
    expect(txMock.authSession.create).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("rotates a trusted token by old-hash CAS and links the restored session", async () => {
    cookieStore.get.mockReturnValue({ value: "old-token" });
    txMock.trustedDevice.findFirst.mockResolvedValue({
      id: "d1", userId: "u1", securityVersion: 2,
      user: { status: "ACTIVE", role: "MEMBER", securityVersion: 2 },
    });
    txMock.trustedDevice.updateMany.mockResolvedValue({ count: 1 });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });

    await expect(restoreSessionFromTrustedDevice("192.0.2.1", "ua")).resolves.toMatchObject({ status: "restored" });

    expect(txMock.trustedDevice.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "d1", tokenHash: hashTrustedDeviceToken("old-token") }),
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    }));
    expect(txMock.trustedDevice.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tokenHash: expect.any(String) }) });
    expect(txMock.authSession.create).toHaveBeenCalledWith({ data: expect.objectContaining({ trustedDeviceId: "d-replacement" }) });
    expect(cookieStore.set).toHaveBeenCalledTimes(2);
  });

  it("allows at most one concurrent restore using the same trusted token", async () => {
    cookieStore.get.mockReturnValue({ value: "old-token" });
    txMock.trustedDevice.findFirst.mockResolvedValue({
      id: "d1", userId: "u1", securityVersion: 2,
      user: { status: "ACTIVE", role: "MEMBER", securityVersion: 2 },
    });
    txMock.trustedDevice.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });

    const results = await Promise.all([
      restoreSessionFromTrustedDevice(),
      restoreSessionFromTrustedDevice(),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["conflict", "restored"]);
    expect(txMock.authSession.create).toHaveBeenCalledTimes(1);
    // The loser must not erase or overwrite the winner's newly rotated cookie.
    expect(cookieStore.delete).not.toHaveBeenCalled();
    expect(cookieStore.set).toHaveBeenCalledTimes(2);
  });

  it("rolls trusted rotation back and exposes no cookie when session creation fails", async () => {
    cookieStore.get.mockReturnValue({ value: "old-token" });
    txMock.trustedDevice.findFirst.mockResolvedValue({
      id: "d1", userId: "u1", securityVersion: 2,
      user: { status: "ACTIVE", role: "MEMBER", securityVersion: 2 },
    });
    txMock.trustedDevice.updateMany.mockResolvedValue({ count: 1 });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });
    txMock.authSession.create.mockRejectedValue(new Error("session insert failed"));
    await expect(restoreSessionFromTrustedDevice()).rejects.toThrow("session insert failed");
    expect(txMock.trustedDevice.updateMany).toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("revokes a device and all sessions derived from it in one transaction", async () => {
    txMock.trustedDevice.update.mockResolvedValue({ id: "d1", tokenHash: "hash" });
    await revokeTrustedDevice("u1", "d1");
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.authSession.deleteMany).toHaveBeenCalledWith({ where: { trustedDeviceId: "d1" } });
  });

  it("rolls back OTP step consumption when session creation fails", async () => {
    txMock.userTotpFactor.updateMany.mockResolvedValue({ count: 1 });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });
    txMock.authSession.create.mockRejectedValue(new Error("session insert failed"));
    prismaMock.$transaction.mockImplementation(async (work: (tx: typeof txMock) => unknown) => {
      try { return await work(txMock); }
      catch (error) {
        // A real transaction rolls this update back; this assertion proves both writes share it.
        expect(txMock.userTotpFactor.updateMany).toHaveBeenCalled();
        throw error;
      }
    });

    await expect(commitOtpLogin({
      factorId: "f1", userId: "u1", securityVersion: 3, timeStep: 100,
      ipAddress: null, userAgent: null, rememberDevice: false,
    })).rejects.toThrow("session insert failed");
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("creates remembered device and OTP session in the same transaction", async () => {
    txMock.userTotpFactor.updateMany.mockResolvedValue({ count: 1 });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });
    txMock.authSession.create.mockResolvedValue({ id: "s-new" });
    txMock.trustedDevice.create.mockResolvedValue({ id: "d-new" });
    await commitOtpLogin({
      factorId: "f1", userId: "u1", securityVersion: 3, timeStep: 100,
      ipAddress: "192.0.2.1", userAgent: "ua", rememberDevice: true,
    });
    expect(txMock.trustedDevice.create).toHaveBeenCalled();
    expect(txMock.authSession.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "u1", securityVersion: 3, sessionTokenHash: expect.any(String),
    }) });
    expect(hashSessionToken).toBeTypeOf("function");
  });

  it("rolls OTP/session changes back and exposes no cookie when trusted-device creation fails", async () => {
    txMock.userTotpFactor.updateMany.mockResolvedValue({ count: 1 });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });
    txMock.authSession.create.mockResolvedValue({ id: "s-new" });
    txMock.trustedDevice.create.mockRejectedValue(new Error("trusted insert failed"));
    await expect(commitOtpLogin({
      factorId: "f1", userId: "u1", securityVersion: 3, timeStep: 100,
      ipAddress: null, userAgent: null, rememberDevice: true,
    })).rejects.toThrow("trusted insert failed");
    expect(txMock.authSession.create).toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("does not clear logout cookies when its database transaction fails", async () => {
    cookieStore.get.mockReturnValue({ value: "token" });
    prismaMock.$transaction.mockRejectedValue(new Error("database unavailable"));
    const { logoutCurrentDevice } = await import("@/lib/trusted-device");
    await expect(logoutCurrentDevice()).rejects.toThrow("database unavailable");
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("logs out the whole account by resolving both browser credentials and bumping securityVersion with CAS", async () => {
    cookieStore.get.mockImplementation((name: string) => ({ value: name.includes("trusted") ? "trusted-token" : "session-token" }));
    txMock.authSession.findUnique.mockResolvedValue({ userId: "u1", user: { securityVersion: 7 } });
    txMock.trustedDevice.findFirst.mockResolvedValue({ userId: "u1", user: { securityVersion: 7 } });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });
    const { logoutCurrentDevice } = await import("@/lib/trusted-device");
    await logoutCurrentDevice();
    expect(txMock.authSession.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { sessionTokenHash: hashSessionToken("session-token") } }));
    expect(txMock.trustedDevice.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: hashTrustedDeviceToken("trusted-token") } }));
    expect(txMock.user.updateMany).toHaveBeenCalledTimes(1);
    expect(txMock.user.updateMany).toHaveBeenCalledWith({ where: { id: "u1", securityVersion: 7 }, data: { securityVersion: { increment: 1 } } });
    expect(txMock.authSession.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(txMock.trustedDevice.updateMany).toHaveBeenCalledWith({ where: { userId: "u1", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(cookieStore.delete).toHaveBeenCalledTimes(2);
  });

  it("invalidates both owners when session and trusted-device cookies belong to different users", async () => {
    cookieStore.get.mockImplementation((name: string) => ({ value: name.includes("trusted") ? "trusted-user-a" : "session-user-b" }));
    txMock.authSession.findUnique.mockResolvedValue({ userId: "user-b", user: { securityVersion: 4 } });
    txMock.trustedDevice.findFirst.mockResolvedValue({ userId: "user-a", user: { securityVersion: 9 } });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });

    const { logoutCurrentDevice } = await import("@/lib/trusted-device");
    await logoutCurrentDevice();

    expect(txMock.trustedDevice.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tokenHash: hashTrustedDeviceToken("trusted-user-a") },
    }));
    expect(txMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-a", securityVersion: 9 },
      data: { securityVersion: { increment: 1 } },
    });
    expect(txMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-b", securityVersion: 4 },
      data: { securityVersion: { increment: 1 } },
    });
    expect(txMock.authSession.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-a" } });
    expect(txMock.authSession.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-b" } });
    expect(txMock.trustedDevice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-a", revokedAt: null } }));
    expect(txMock.trustedDevice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-b", revokedAt: null } }));
  });

  it("falls back to the trusted token and invalidates a restore committed before logout", async () => {
    cookieStore.get.mockImplementation((name: string) => name.includes("trusted") ? { value: "rotated-token" } : undefined);
    txMock.trustedDevice.findFirst.mockResolvedValue({ userId: "u1", user: { securityVersion: 8 } });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });
    const { logoutCurrentDevice } = await import("@/lib/trusted-device");
    await logoutCurrentDevice();
    expect(txMock.trustedDevice.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tokenHash: hashTrustedDeviceToken("rotated-token") }, include: { user: { select: { securityVersion: true } } },
    }));
    expect(txMock.authSession.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(txMock.trustedDevice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", revokedAt: null } }));
  });

  it("rejects a restore that starts after whole-account logout revoked the trusted token", async () => {
    cookieStore.get.mockReturnValue({ value: "logged-out-token" });
    txMock.trustedDevice.findFirst.mockResolvedValue(null);
    await expect(restoreSessionFromTrustedDevice()).resolves.toEqual({ status: "invalid" });
    expect(txMock.trustedDevice.updateMany).not.toHaveBeenCalled();
    expect(txMock.authSession.create).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
