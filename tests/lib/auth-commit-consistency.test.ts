import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/env", () => ({ env: {
  SESSION_SECRET: "test-session-secret-long", APP_BASE_URL: "https://example.test",
} }));

import { commitOtpLogin } from "@/lib/otp";
import { SESSION_COOKIE_NAME, TRUSTED_DEVICE_COOKIE_NAME } from "@/lib/constants/auth";
import { getResponseCookies } from "@/lib/http/cookies";
import { hashSessionToken } from "@/lib/session";
import {
  hashTrustedDeviceToken,
  restoreSessionFromTrustedDevice,
  revokeTrustedDevice,
} from "@/lib/trusted-device";
import { runWithRequestContext } from "@/server/context/request-context";

function withRequestContext<T>(callback: () => T, cookie = ""): T {
  return runWithRequestContext(new Request("https://example.test/test", {
    headers: { cookie },
  }), callback);
}

const sessionCookie = (token: string) => `${SESSION_COOKIE_NAME}=${token}`;
const trustedCookie = (token: string) => `${TRUSTED_DEVICE_COOKIE_NAME}=${token}`;
const bothCookies = (sessionToken: string, trustedToken: string) =>
  `${sessionCookie(sessionToken)}; ${trustedCookie(trustedToken)}`;

describe("atomic authentication commits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (work: (tx: typeof txMock) => unknown) => work(txMock));
    txMock.authSession.findUnique.mockResolvedValue(null);
    txMock.trustedDevice.create.mockResolvedValue({ id: "d-replacement" });
  });

  it("does not restore a trusted-device account over an existing valid session", async () => {
    txMock.authSession.findUnique.mockResolvedValue({
      userId: "user-b",
      securityVersion: 4,
      expiresAt: new Date(Date.now() + 60_000),
      user: { status: "ACTIVE", role: "MEMBER", securityVersion: 4 },
    });

    await withRequestContext(async () => {
      await expect(restoreSessionFromTrustedDevice()).resolves.toEqual({ status: "session_present" });
      expect(txMock.trustedDevice.findFirst).not.toHaveBeenCalled();
      expect(txMock.trustedDevice.updateMany).not.toHaveBeenCalled();
      expect(txMock.authSession.create).not.toHaveBeenCalled();
      expect(getResponseCookies()).toEqual([]);
    }, bothCookies("session-user-b", "trusted-user-a"));
  });

  it("rotates a trusted token by old-hash CAS and links the restored session", async () => {
    txMock.trustedDevice.findFirst.mockResolvedValue({
      id: "d1", userId: "u1", securityVersion: 2,
      user: { status: "ACTIVE", role: "MEMBER", securityVersion: 2 },
    });
    txMock.trustedDevice.updateMany.mockResolvedValue({ count: 1 });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });

    await withRequestContext(async () => {
      await expect(restoreSessionFromTrustedDevice("192.0.2.1", "ua")).resolves.toMatchObject({ status: "restored" });

      expect(txMock.trustedDevice.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: "d1", tokenHash: hashTrustedDeviceToken("old-token") }),
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }));
      expect(txMock.trustedDevice.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tokenHash: expect.any(String) }) });
      expect(txMock.authSession.create).toHaveBeenCalledWith({ data: expect.objectContaining({ trustedDeviceId: "d-replacement" }) });
      expect(getResponseCookies()).toEqual([
        expect.stringMatching(new RegExp(`^${TRUSTED_DEVICE_COOKIE_NAME}=[0-9a-f]{64}; Path=/; Max-Age=\\d+; HttpOnly; Secure; SameSite=Lax$`)),
        expect.stringMatching(new RegExp(`^${SESSION_COOKIE_NAME}=[0-9a-f]{64}; Path=/; Max-Age=\\d+; HttpOnly; Secure; SameSite=Lax$`)),
      ]);
    }, trustedCookie("old-token"));
  });

  it("allows at most one concurrent restore using the same trusted token", async () => {
    txMock.trustedDevice.findFirst.mockResolvedValue({
      id: "d1", userId: "u1", securityVersion: 2,
      user: { status: "ACTIVE", role: "MEMBER", securityVersion: 2 },
    });
    txMock.trustedDevice.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });

    const responses = await Promise.all([
      withRequestContext(async () => ({
        result: await restoreSessionFromTrustedDevice(),
        cookies: getResponseCookies(),
      }), trustedCookie("old-token")),
      withRequestContext(async () => ({
        result: await restoreSessionFromTrustedDevice(),
        cookies: getResponseCookies(),
      }), trustedCookie("old-token")),
    ]);
    expect(responses.map(({ result }) => result.status).sort()).toEqual(["conflict", "restored"]);
    expect(txMock.authSession.create).toHaveBeenCalledTimes(1);
    const winner = responses.find(({ result }) => result.status === "restored");
    const loser = responses.find(({ result }) => result.status === "conflict");
    expect(winner?.cookies).toEqual([
      expect.stringMatching(new RegExp(`^${TRUSTED_DEVICE_COOKIE_NAME}=[0-9a-f]{64}; Path=/; Max-Age=\\d+; HttpOnly; Secure; SameSite=Lax$`)),
      expect.stringMatching(new RegExp(`^${SESSION_COOKIE_NAME}=[0-9a-f]{64}; Path=/; Max-Age=\\d+; HttpOnly; Secure; SameSite=Lax$`)),
    ]);
    // A separate losing response must neither overwrite nor delete either browser credential.
    expect(loser?.cookies).toEqual([]);
  });

  it("rolls trusted rotation back and exposes no cookie when session creation fails", async () => {
    txMock.trustedDevice.findFirst.mockResolvedValue({
      id: "d1", userId: "u1", securityVersion: 2,
      user: { status: "ACTIVE", role: "MEMBER", securityVersion: 2 },
    });
    txMock.trustedDevice.updateMany.mockResolvedValue({ count: 1 });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });
    txMock.authSession.create.mockRejectedValue(new Error("session insert failed"));
    await withRequestContext(async () => {
      await expect(restoreSessionFromTrustedDevice()).rejects.toThrow("session insert failed");
      expect(txMock.trustedDevice.updateMany).toHaveBeenCalled();
      expect(getResponseCookies()).toEqual([]);
    }, trustedCookie("old-token"));
  });

  it("revokes a device and all sessions derived from it in one transaction", async () => {
    txMock.trustedDevice.update.mockResolvedValue({ id: "d1", tokenHash: "hash" });
    await withRequestContext(async () => {
      await revokeTrustedDevice("u1", "d1");
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.authSession.deleteMany).toHaveBeenCalledWith({ where: { trustedDeviceId: "d1" } });
      expect(getResponseCookies()).toEqual([]);
    });
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

    await withRequestContext(async () => {
      await expect(commitOtpLogin({
        factorId: "f1", userId: "u1", securityVersion: 3, timeStep: 100,
        ipAddress: null, userAgent: null, rememberDevice: false,
      })).rejects.toThrow("session insert failed");
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(getResponseCookies()).toEqual([]);
    });
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
    await withRequestContext(async () => {
      await expect(commitOtpLogin({
        factorId: "f1", userId: "u1", securityVersion: 3, timeStep: 100,
        ipAddress: null, userAgent: null, rememberDevice: true,
      })).rejects.toThrow("trusted insert failed");
      expect(txMock.authSession.create).toHaveBeenCalled();
      expect(getResponseCookies()).toEqual([]);
    });
  });

  it("does not clear logout cookies when its database transaction fails", async () => {
    prismaMock.$transaction.mockRejectedValue(new Error("database unavailable"));
    const { logoutCurrentDevice } = await import("@/lib/trusted-device");
    await withRequestContext(async () => {
      await expect(logoutCurrentDevice()).rejects.toThrow("database unavailable");
      expect(getResponseCookies()).toEqual([]);
    }, bothCookies("token", "token"));
  });

  it("logs out the whole account by resolving both browser credentials and bumping securityVersion with CAS", async () => {

    txMock.authSession.findUnique.mockResolvedValue({ userId: "u1", user: { securityVersion: 7 } });
    txMock.trustedDevice.findFirst.mockResolvedValue({ userId: "u1", user: { securityVersion: 7 } });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });
    const { logoutCurrentDevice } = await import("@/lib/trusted-device");
    await withRequestContext(async () => {
      await logoutCurrentDevice();
      expect(txMock.authSession.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { sessionTokenHash: hashSessionToken("session-token") } }));
      expect(txMock.trustedDevice.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: hashTrustedDeviceToken("trusted-token") } }));
      expect(txMock.user.updateMany).toHaveBeenCalledTimes(1);
      expect(txMock.user.updateMany).toHaveBeenCalledWith({ where: { id: "u1", securityVersion: 7 }, data: { securityVersion: { increment: 1 } } });
      expect(txMock.authSession.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
      expect(txMock.trustedDevice.updateMany).toHaveBeenCalledWith({ where: { userId: "u1", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
      expect(getResponseCookies()).toEqual([
        `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0`,
        `${TRUSTED_DEVICE_COOKIE_NAME}=; Path=/; Max-Age=0`,
      ]);
    }, bothCookies("session-token", "trusted-token"));
  });

  it("invalidates both owners when session and trusted-device cookies belong to different users", async () => {

    txMock.authSession.findUnique.mockResolvedValue({ userId: "user-b", user: { securityVersion: 4 } });
    txMock.trustedDevice.findFirst.mockResolvedValue({ userId: "user-a", user: { securityVersion: 9 } });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });

    const { logoutCurrentDevice } = await import("@/lib/trusted-device");
    await withRequestContext(async () => {
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
      expect(getResponseCookies()).toEqual([
        `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0`,
        `${TRUSTED_DEVICE_COOKIE_NAME}=; Path=/; Max-Age=0`,
      ]);
    }, bothCookies("session-user-b", "trusted-user-a"));
  });

  it("falls back to the trusted token and invalidates a restore committed before logout", async () => {

    txMock.trustedDevice.findFirst.mockResolvedValue({ userId: "u1", user: { securityVersion: 8 } });
    txMock.user.updateMany.mockResolvedValue({ count: 1 });
    const { logoutCurrentDevice } = await import("@/lib/trusted-device");
    await withRequestContext(async () => {
      await logoutCurrentDevice();
      expect(txMock.trustedDevice.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { tokenHash: hashTrustedDeviceToken("rotated-token") }, include: { user: { select: { securityVersion: true } } },
      }));
      expect(txMock.authSession.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
      expect(txMock.trustedDevice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", revokedAt: null } }));
      expect(getResponseCookies()).toEqual([
        `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0`,
        `${TRUSTED_DEVICE_COOKIE_NAME}=; Path=/; Max-Age=0`,
      ]);
    }, trustedCookie("rotated-token"));
  });

  it("rejects a restore that starts after whole-account logout revoked the trusted token", async () => {
    txMock.trustedDevice.findFirst.mockResolvedValue(null);
    await withRequestContext(async () => {
      await expect(restoreSessionFromTrustedDevice()).resolves.toEqual({ status: "invalid" });
      expect(txMock.trustedDevice.updateMany).not.toHaveBeenCalled();
      expect(txMock.authSession.create).not.toHaveBeenCalled();
      expect(getResponseCookies()).toEqual([]);
    }, trustedCookie("logged-out-token"));
  });
});
