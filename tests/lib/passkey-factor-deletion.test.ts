import { beforeEach, describe, expect, it, vi } from "vitest";

const requireApiSession = vi.hoisted(() => vi.fn());
const tx = vi.hoisted(() => ({
  webAuthnCredential: {
    findFirst: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
  },
  userTotpFactor: { findUnique: vi.fn() },
}));
const prisma = vi.hoisted(() => ({
  ...tx,
  $transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireApiSession }));
vi.mock("@/lib/prisma", () => ({ prisma }));

import { DELETE } from "@/app/api/auth/passkey/[id]/route";
import { deleteCredential } from "@/lib/webauthn";

describe("passkey authentication-factor deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (work: (client: typeof tx) => unknown) => work(tx));
    tx.webAuthnCredential.findFirst.mockResolvedValue({ id: "credential-only" });
    tx.webAuthnCredential.count.mockResolvedValue(0);
    tx.userTotpFactor.findUnique.mockResolvedValue(null);
    tx.webAuthnCredential.delete.mockResolvedValue({ id: "credential-only" });
    requireApiSession.mockResolvedValue({ userId: "user-1" });
  });

  it("does not delete a user's only passkey when no active TOTP factor exists", async () => {
    await expect(deleteCredential("user-1", "credential-only")).rejects.toThrow(/last authentication factor/i);
    expect(tx.webAuthnCredential.delete).not.toHaveBeenCalled();
  });

  it("returns conflict instead of deleting the sole authentication factor through the API", async () => {
    const response = await DELETE(new Request("https://example.test/api/auth/passkey/credential-only") as never, {
      params: Promise.resolve({ id: "credential-only" }),
    });

    expect(response.status).toBe(409);
    expect(tx.webAuthnCredential.delete).not.toHaveBeenCalled();
  });

  it("allows deletion when another passkey remains", async () => {
    tx.webAuthnCredential.count.mockResolvedValue(1);
    await expect(deleteCredential("user-1", "credential-only")).resolves.toMatchObject({ id: "credential-only" });
    expect(tx.webAuthnCredential.delete).toHaveBeenCalledWith({ where: { id: "credential-only", userId: "user-1" } });
  });

  it("allows deletion when an active TOTP factor remains", async () => {
    tx.userTotpFactor.findUnique.mockResolvedValue({ id: "totp-1", revokedAt: null });
    await expect(deleteCredential("user-1", "credential-only")).resolves.toMatchObject({ id: "credential-only" });
    expect(tx.webAuthnCredential.delete).toHaveBeenCalled();
  });
});
