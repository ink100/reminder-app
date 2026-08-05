import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyMock = vi.hoisted(() => vi.fn());
const getInvitationTargetMock = vi.hoisted(() => vi.fn());
const getCeremonyMock = vi.hoisted(() => vi.fn());
const consumeCeremonyMock = vi.hoisted(() => vi.fn());
const tx = vi.hoisted(() => ({
  webAuthnChallenge: { updateMany: vi.fn() }, memberInvitation: { updateMany: vi.fn() },
  user: { updateMany: vi.fn() }, webAuthnCredential: { create: vi.fn() }, pendingTotpEnrollment: { deleteMany: vi.fn() },
  authSession: { create: vi.fn() },
}));
const prismaMock = vi.hoisted(() => ({ webAuthnChallenge: { findFirst: vi.fn() }, $transaction: vi.fn() }));
vi.mock("@simplewebauthn/server", () => ({ verifyRegistrationResponse: verifyMock }));
vi.mock("@/lib/invitation-acceptance", () => ({ getInvitationTarget: getInvitationTargetMock, INVALID_INVITATION: "Invitation is invalid or expired" }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/webauthn", () => ({ generateRegOptions: vi.fn() }));
vi.mock("@/lib/webauthn-ceremonies", () => ({
  getWebAuthnCeremony: getCeremonyMock,
  consumeWebAuthnCeremonyInTransaction: consumeCeremonyMock,
}));

import { completeInvitationPasskey } from "@/lib/invitation-passkey";

const invitation = { id: "invite", targetUserId: "user", targetUser: { securityVersion: 4 } };
const ceremony = { id: "challenge", challenge: "expected", expiresAt: new Date("2026-07-30T00:00:00Z") };
const response = {} as never;

describe("invitation passkey negative paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInvitationTargetMock.mockResolvedValue(invitation);
    prismaMock.$transaction.mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx));
    prismaMock.webAuthnChallenge.findFirst.mockResolvedValue(ceremony);
    getCeremonyMock.mockImplementation(async (input: { ceremonyId: string; browserToken: string }) => {
      const row = await prismaMock.webAuthnChallenge.findFirst({ where: expect.objectContaining({
        id: input.ceremonyId, browserTokenHash: `hash:${input.browserToken}`,
      }) });
      if (!row) throw new Error("invalid");
      return row;
    });
    consumeCeremonyMock.mockImplementation(async (client: typeof tx, row: { id: string }) => {
      const result = await client.webAuthnChallenge.updateMany({ where: { id: row.id }, data: { consumedAt: expect.any(Date) } });
      if (result.count !== 1) throw new Error("Invitation is invalid or expired");
    });
    verifyMock.mockResolvedValue({ verified: true, registrationInfo: { credential: { id: "credential", publicKey: new Uint8Array([1]), counter: 0 } } });
    tx.webAuthnChallenge.updateMany.mockResolvedValue({ count: 1 });
    tx.memberInvitation.updateMany.mockResolvedValue({ count: 1 });
    tx.user.updateMany.mockResolvedValue({ count: 1 });
  });

  it.each(["expired", "revoked"])("fails closed when the invitation is %s before ceremony lookup", async (state) => {
    getInvitationTargetMock.mockRejectedValue(new Error(`Invitation ${state}`));
    await expect(completeInvitationPasskey("token", response, "browser", "challenge")).rejects.toThrow();
    expect(prismaMock.webAuthnChallenge.findFirst).not.toHaveBeenCalled();
  });

  it("rejects replay when its challenge was already consumed", async () => {
    prismaMock.webAuthnChallenge.findFirst.mockResolvedValue(null);
    await expect(completeInvitationPasskey("token", response, "browser", "challenge")).rejects.toThrow(/invalid|expired/i);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("does not accept a challenge created in another browser", async () => {
    prismaMock.webAuthnChallenge.findFirst.mockResolvedValue(null);
    await expect(completeInvitationPasskey("token", response, "other-browser", "challenge")).rejects.toThrow(/invalid|expired/i);
    expect(prismaMock.webAuthnChallenge.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "challenge", browserTokenHash: "hash:other-browser" }),
    });
  });

  it.each([
    ["challenge race", "webAuthnChallenge"], ["invitation race", "memberInvitation"], ["activation race", "user"],
  ])("rejects a concurrent/replayed completion losing the %s CAS", async (_label, model) => {
    const updateMany = model === "webAuthnChallenge"
      ? tx.webAuthnChallenge.updateMany
      : model === "memberInvitation"
        ? tx.memberInvitation.updateMany
        : tx.user.updateMany;
    updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(completeInvitationPasskey("token", response, "browser", "challenge", {}, new Date("2026-07-29T00:00:00Z"))).rejects.toThrow(/invalid|expired/i);
    expect(tx.webAuthnCredential.create).not.toHaveBeenCalled();
  });

  it("creates the activated user's session in the credential/invitation transaction", async () => {
    const result = await completeInvitationPasskey("token", response, "browser", "challenge", { ipAddress: "192.0.2.1", userAgent: "ua" });
    expect(result).toEqual({ userId: "user", sessionToken: expect.any(String) });
    expect(tx.authSession.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "user", authMethod: "passkey", securityVersion: 4 }) });
  });

  it("rolls credential and activation back when session creation fails", async () => {
    tx.authSession.create.mockRejectedValue(new Error("session insert failed"));
    await expect(completeInvitationPasskey("token", response, "browser", "challenge")).rejects.toThrow("session insert failed");
    expect(tx.webAuthnCredential.create).toHaveBeenCalled();
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
