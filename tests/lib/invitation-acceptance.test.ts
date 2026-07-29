import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  memberInvitation: { updateMany: vi.fn() },
  userTotpFactor: { upsert: vi.fn() },
  pendingTotpEnrollment: { create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  webAuthnChallenge: { updateMany: vi.fn(), deleteMany: vi.fn() },
  user: { updateMany: vi.fn() },
  authSession: { create: vi.fn() },
}));
const prismaMock = vi.hoisted(() => ({
  memberInvitation: { findUnique: vi.fn() },
  pendingTotpEnrollment: { deleteMany: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
  webAuthnChallenge: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
const otpMock = vi.hoisted(() => ({
  generateOtpSecret: vi.fn(),
  generateOtpSetupPayload: vi.fn(),
  verifyOtpTokenDetails: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/env", () => ({ env: { SESSION_SECRET: "test-session-secret-long", OTP_SECRET_ENCRYPTION_KEY: "12345678901234567890123456789012", APP_NAME: "Test" } }));
vi.mock("@/lib/otp", () => otpMock);
vi.mock("@/lib/crypto", () => ({ encryptText: (value: string) => `enc:${value}`, decryptText: (value: string) => value.replace(/^enc:/, "") }));

import { completeInvitationTotp, setupInvitationTotp } from "@/lib/invitation-acceptance";
import { hashInvitationToken } from "@/lib/member-invitations";

const validInvite = {
  id: "invite-1", targetUserId: "u1", expiresAt: new Date(Date.now() + 60_000), consumedAt: null, revokedAt: null,
  targetUser: { id: "u1", username: "alice", displayName: "Alice", status: "INVITED", securityVersion: 2 },
};

describe("invitation TOTP acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((fn: (db: typeof tx) => unknown) => fn(tx));
    tx.memberInvitation.updateMany.mockResolvedValue({ count: 1 });
    tx.pendingTotpEnrollment.updateMany.mockResolvedValue({ count: 1 });
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    otpMock.verifyOtpTokenDetails.mockResolvedValue({ valid: true, timeStep: 42 });
    tx.pendingTotpEnrollment.create.mockImplementation(async ({ data }: { data: object }) => ({ id: "enrollment-new", ...data }));
  });

  it.each([
    ["missing", null],
    ["expired", { ...validInvite, expiresAt: new Date(0) }],
    ["revoked", { ...validInvite, revokedAt: new Date() }],
    ["consumed", { ...validInvite, consumedAt: new Date() }],
    ["wrong-status", { ...validInvite, targetUser: { ...validInvite.targetUser, status: "ACTIVE" } }],
  ])("rejects %s invitations with one generic error", async (_name, invitation) => {
    prismaMock.memberInvitation.findUnique.mockResolvedValue(invitation);
    await expect(setupInvitationTotp("not-a-valid-capability")).rejects.toThrow("Invitation is invalid or expired");
  });

  it("creates independent encrypted pending secrets and labels each invited user", async () => {
    prismaMock.memberInvitation.findUnique
      .mockResolvedValueOnce(validInvite)
      .mockResolvedValueOnce({ ...validInvite, id: "invite-2", targetUserId: "u2", targetUser: { id: "u2", username: "bob", displayName: "Bob", status: "INVITED", securityVersion: 3 } });
    otpMock.generateOtpSecret.mockReturnValueOnce("secret-a").mockReturnValueOnce("secret-b");
    otpMock.generateOtpSetupPayload.mockImplementation(async (secret: string, label: string) => ({ secret, label, qrCodeDataUrl: "data:image/png;base64,safe" }));

    const a = await setupInvitationTotp("token-a");
    const b = await setupInvitationTotp("token-b");
    expect(a.secret).toBe("secret-a");
    expect(b.secret).toBe("secret-b");
    expect(otpMock.generateOtpSetupPayload).toHaveBeenNthCalledWith(1, "secret-a", "Alice");
    expect(otpMock.generateOtpSetupPayload).toHaveBeenNthCalledWith(2, "secret-b", "Bob");
    expect(tx.pendingTotpEnrollment.create.mock.calls[0][0].data.secretEncrypted).not.toBe("secret-a");
  });

  it("replaces pending TOTP and invalidates passkey ceremonies in one transaction", async () => {
    prismaMock.memberInvitation.findUnique.mockResolvedValue(validInvite);
    otpMock.generateOtpSecret.mockReturnValue("secret");
    otpMock.generateOtpSetupPayload.mockResolvedValue({ secret: "secret", qrCodeDataUrl: "data:" });
    await setupInvitationTotp("token");
    expect(prismaMock.pendingTotpEnrollment.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.webAuthnChallenge.updateMany).not.toHaveBeenCalled();
    expect(tx.pendingTotpEnrollment.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(tx.pendingTotpEnrollment.create).toHaveBeenCalled();
    expect(tx.webAuthnChallenge.updateMany).toHaveBeenCalled();
  });

  it("gives every setup an immutable enrollment id and rejects completion from an older setup", async () => {
    prismaMock.memberInvitation.findUnique.mockResolvedValue(validInvite);
    tx.pendingTotpEnrollment.create.mockResolvedValueOnce({ id: "enrollment-v1" }).mockResolvedValueOnce({ id: "enrollment-v2" });
    otpMock.generateOtpSetupPayload.mockResolvedValue({ secret: "secret", qrCodeDataUrl: "data:" });
    await expect(setupInvitationTotp("token")).resolves.toMatchObject({ enrollmentId: "enrollment-v1" });
    await expect(setupInvitationTotp("token")).resolves.toMatchObject({ enrollmentId: "enrollment-v2" });
    prismaMock.pendingTotpEnrollment.findUnique.mockResolvedValue({ id: "enrollment-v2", userId: "u1", secretEncrypted: "enc:new", expiresAt: new Date(Date.now() + 60_000), consumedAt: null });
    await expect(completeInvitationTotp("token", "123456", "enrollment-v1")).rejects.toThrow("Invitation is invalid or expired");
    expect(otpMock.verifyOtpTokenDetails).not.toHaveBeenCalled();
  });

  it("atomically installs the factor, activates the user, consumes invite/pending and invalidates ceremonies", async () => {
    prismaMock.memberInvitation.findUnique.mockResolvedValue(validInvite);
    prismaMock.pendingTotpEnrollment.findUnique.mockResolvedValue({ id: "enrollment-1", userId: "u1", secretEncrypted: "encrypted", expiresAt: new Date(Date.now() + 60_000), consumedAt: null });
    const result = await completeInvitationTotp("token", "123456", "enrollment-1", { ipAddress: "192.0.2.1", userAgent: "ua" });
    expect(result).toEqual({ userId: "u1", sessionToken: expect.any(String) });
    expect(tx.userTotpFactor.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1" } }));
    expect(tx.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "u1", status: "INVITED" }, data: expect.objectContaining({ status: "ACTIVE" }) }));
    expect(tx.memberInvitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "invite-1", consumedAt: null }) }));
    expect(tx.webAuthnChallenge.updateMany).toHaveBeenCalled();
    expect(tx.authSession.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "u1", authMethod: "totp" }) });
  });

  it("rolls invitation activation and factor installation back when session creation fails", async () => {
    prismaMock.memberInvitation.findUnique.mockResolvedValue(validInvite);
    prismaMock.pendingTotpEnrollment.findUnique.mockResolvedValue({ id: "enrollment-1", userId: "u1", secretEncrypted: "encrypted", expiresAt: new Date(Date.now() + 60_000), consumedAt: null });
    tx.authSession.create.mockRejectedValue(new Error("session insert failed"));
    await expect(completeInvitationTotp("token", "123456", "enrollment-1")).rejects.toThrow("session insert failed");
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.userTotpFactor.upsert).toHaveBeenCalled();
    expect(tx.memberInvitation.updateMany).toHaveBeenCalled();
  });

  it("does not consume anything for a wrong code and never accesses AppSetting", async () => {
    prismaMock.memberInvitation.findUnique.mockResolvedValue(validInvite);
    prismaMock.pendingTotpEnrollment.findUnique.mockResolvedValue({ id: "enrollment-1", userId: "u1", secretEncrypted: "encrypted", expiresAt: new Date(Date.now() + 60_000), consumedAt: null });
    otpMock.verifyOtpTokenDetails.mockResolvedValue({ valid: false });
    await expect(completeInvitationTotp("token", "000000", "enrollment-1")).rejects.toThrow("Invitation is invalid or expired");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect((prismaMock as Record<string, unknown>).appSetting).toBeUndefined();
    expect(hashInvitationToken("token")).not.toContain("token");
  });
});
