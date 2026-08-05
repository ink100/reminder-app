import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyAuthenticationResponse = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  webAuthnCredential: { findUnique: vi.fn(), updateMany: vi.fn() },
  webAuthnChallenge: { findFirst: vi.fn(), updateMany: vi.fn() },
  user: { updateMany: vi.fn() },
  authSession: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: vi.fn(), verifyRegistrationResponse: vi.fn(), generateAuthenticationOptions: vi.fn(), verifyAuthenticationResponse,
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { verifyAuthResponse } from "@/lib/webauthn";

describe("atomic WebAuthn authentication commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (work: (tx: typeof prismaMock) => unknown) => work(prismaMock));
    prismaMock.webAuthnChallenge.findFirst.mockResolvedValue({ id: "challenge-row", challenge: "challenge" });
    prismaMock.webAuthnChallenge.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.webAuthnCredential.findUnique.mockResolvedValue({
      id: "credential-row", credentialId: "credential", publicKey: "AA==", counter: BigInt(8), userId: "u1",
      user: { status: "ACTIVE", role: "MEMBER", securityVersion: 4 },
    });
    verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 9 } });
  });

  it("CAS-consumes challenge and counter and creates the session in one transaction", async () => {
    prismaMock.webAuthnCredential.updateMany.mockResolvedValue({ count: 1 });
    await expect(verifyAuthResponse({ id: "credential" } as never, "browser", "challenge-row")).resolves.toEqual(expect.objectContaining({
      verified: true, userId: "u1", sessionToken: expect.any(String),
    }));
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.webAuthnChallenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "challenge-row", consumedAt: null }),
    }));
    expect(prismaMock.webAuthnCredential.updateMany).toHaveBeenCalledWith({
      where: { id: "credential-row", counter: BigInt(8) },
      data: { counter: BigInt(9), lastUsedAt: expect.any(Date) },
    });
    expect(prismaMock.authSession.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "u1", authMethod: "passkey", securityVersion: 4,
    }) });
  });

  it("rejects a concurrent stale verification instead of overwriting the newer counter", async () => {
    prismaMock.webAuthnCredential.updateMany.mockResolvedValue({ count: 0 });
    await expect(verifyAuthResponse({ id: "credential" } as never, "browser", "challenge-row")).rejects.toThrow(/counter|concurrent|stale/i);
  });

  it("does not update the counter or create a session after losing challenge CAS", async () => {
    prismaMock.webAuthnChallenge.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.webAuthnCredential.updateMany.mockResolvedValue({ count: 1 });
    await expect(verifyAuthResponse({ id: "credential" } as never, "browser", "challenge-row")).rejects.toThrow(/expired|used|invalid/i);
    expect(prismaMock.webAuthnCredential.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.authSession.create).not.toHaveBeenCalled();
  });

  it("keeps challenge, counter, and session under the same rollback boundary", async () => {
    prismaMock.webAuthnCredential.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.authSession.create.mockRejectedValue(new Error("session insert failed"));
    await expect(verifyAuthResponse({ id: "credential" } as never, "browser", "challenge-row")).rejects.toThrow("session insert failed");
    expect(prismaMock.webAuthnCredential.updateMany).toHaveBeenCalled();
    expect(prismaMock.webAuthnChallenge.updateMany).toHaveBeenCalled();
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
