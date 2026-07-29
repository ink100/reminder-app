import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  memberInvitation: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  pendingTotpEnrollment: { deleteMany: vi.fn() },
  webAuthnChallenge: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/env", () => ({ env: { SESSION_SECRET: "test-secret-at-least-sixteen" } }));

import { createMemberInvitation, hashInvitationToken, redeemInvitation, revokeInvitation } from "@/lib/member-invitations";

describe("member invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((fn: (db: typeof prismaMock) => unknown) => fn(prismaMock));
  });

  it("returns a random opaque token but persists only its HMAC hash", async () => {
    prismaMock.memberInvitation.findUnique.mockResolvedValue(null);
    prismaMock.memberInvitation.create.mockImplementation(async ({ data }: { data: unknown }) => data);
    const result = await createMemberInvitation({ targetUserId: "u2", invitedById: "admin", expiresAt: new Date(Date.now() + 60_000) });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(result.tokenHash).toBe(hashInvitationToken(result.token));
    expect(JSON.stringify(prismaMock.memberInvitation.create.mock.calls)).not.toContain(result.token);
  });

  it.each(["revoked", "expired"])("safely reissues a %s invitation in place with a rotated token", async (state) => {
    const now = new Date("2026-07-29T00:00:00Z");
    const old = { id: "i1", targetUserId: "u2", tokenHash: hashInvitationToken("old-token"), consumedAt: null,
      revokedAt: state === "revoked" ? new Date("2026-07-28T00:00:00Z") : null,
      expiresAt: state === "expired" ? new Date("2026-07-28T00:00:00Z") : new Date("2026-07-30T00:00:00Z") };
    prismaMock.memberInvitation.findUnique.mockResolvedValue(old);
    prismaMock.memberInvitation.updateMany.mockResolvedValue({ count: 1 });
    const result = await createMemberInvitation({ targetUserId: "u2", invitedById: "admin", expiresAt: new Date("2026-08-01T00:00:00Z") }, prismaMock as never, now);
    expect(result.id).toBe("i1");
    expect(result.token).not.toBe("old-token");
    expect(result.tokenHash).not.toBe(old.tokenHash);
    expect(prismaMock.memberInvitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "i1", tokenHash: old.tokenHash }, data: expect.objectContaining({ tokenHash: result.tokenHash, revokedAt: null, consumedAt: null }) }));
    expect(prismaMock.pendingTotpEnrollment.deleteMany).toHaveBeenCalledWith({ where: { userId: "u2" } });
    expect(prismaMock.webAuthnChallenge.updateMany).toHaveBeenCalled();
  });

  it("rotates a consumed invitation in place and the old token no longer redeems", async () => {
    const now = new Date("2026-07-29T00:00:00Z");
    let stored = { id: "i1", targetUserId: "u2", tokenHash: hashInvitationToken("old-token"), consumedAt: new Date("2026-07-28T00:00:00Z") as Date | null, revokedAt: null as Date | null, expiresAt: new Date("2026-07-30T00:00:00Z"), invitedById: "admin", createdAt: now };
    prismaMock.memberInvitation.findUnique.mockImplementation(async ({ where }: { where: { targetUserId?: string; id?: string; tokenHash?: string } }) => {
      if (where.targetUserId === "u2" || where.id === stored.id || where.tokenHash === stored.tokenHash) return stored;
      return null;
    });
    prismaMock.memberInvitation.updateMany.mockImplementation(async ({ data }: { data: Partial<typeof stored> }) => {
      stored = { ...stored, ...data };
      return { count: 1 };
    });

    const fresh = await createMemberInvitation({ targetUserId: "u2", invitedById: "admin", expiresAt: new Date("2026-08-01T00:00:00Z") }, prismaMock as never, now);
    expect(fresh.id).toBe("i1");
    expect(stored.consumedAt).toBeNull();
    await expect(redeemInvitation("old-token", now)).rejects.toThrow(/invalid|expired/i);
    await expect(redeemInvitation(fresh.token, now)).resolves.toMatchObject({ id: "i1" });
  });

  it("rejects duplicate creation while an invitation is still valid", async () => {
    prismaMock.memberInvitation.findUnique.mockResolvedValue({ id: "i1", targetUserId: "u2", expiresAt: new Date("2026-08-01T00:00:00Z"), revokedAt: null, consumedAt: null });
    await expect(createMemberInvitation({ targetUserId: "u2", invitedById: "admin", expiresAt: new Date("2026-08-02T00:00:00Z") }, prismaMock as never, new Date("2026-07-29T00:00:00Z")))
      .rejects.toThrow(/already.*pending/i);
    expect(prismaMock.memberInvitation.create).not.toHaveBeenCalled();
    expect(prismaMock.memberInvitation.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", { expiresAt: new Date(0), revokedAt: null, consumedAt: null }],
    ["revoked", { expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date(), consumedAt: null }],
    ["consumed", { expiresAt: new Date(Date.now() + 60_000), revokedAt: null, consumedAt: new Date() }],
  ])("rejects %s invitations", async (_label, state) => {
    prismaMock.memberInvitation.findUnique.mockResolvedValue({ id: "i1", tokenHash: "hash", ...state });
    await expect(redeemInvitation("token", new Date())).rejects.toThrow(/invalid|expired/i);
    expect(prismaMock.memberInvitation.updateMany).not.toHaveBeenCalled();
  });

  it("consumes an invitation exactly once", async () => {
    const future = new Date(Date.now() + 60_000);
    prismaMock.memberInvitation.findUnique.mockResolvedValue({ id: "i1", expiresAt: future, revokedAt: null, consumedAt: null });
    prismaMock.memberInvitation.updateMany.mockResolvedValue({ count: 1 });
    await expect(redeemInvitation("token")).resolves.toMatchObject({ id: "i1" });
    expect(prismaMock.memberInvitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ consumedAt: null, revokedAt: null }) }));
  });

  it("revokes only pending invitations and clears unfinished authentication in the same transaction", async () => {
    prismaMock.memberInvitation.findUnique.mockResolvedValue({ id: "i1", targetUserId: "u2", consumedAt: null, revokedAt: null });
    prismaMock.memberInvitation.updateMany.mockResolvedValue({ count: 1 });
    await revokeInvitation("i1");
    expect(prismaMock.memberInvitation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "i1", consumedAt: null, revokedAt: null } }));
    expect(prismaMock.pendingTotpEnrollment.deleteMany).toHaveBeenCalledWith({ where: { userId: "u2" } });
    expect(prismaMock.webAuthnChallenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u2", consumedAt: null } }));
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
  });

  it("distinguishes a missing invitation from a non-pending invitation", async () => {
    prismaMock.memberInvitation.findUnique.mockResolvedValueOnce(null);
    await expect(revokeInvitation("missing")).rejects.toMatchObject({ code: "INVITATION_NOT_FOUND", status: 404 });
    prismaMock.memberInvitation.findUnique.mockResolvedValueOnce({ id: "i1", targetUserId: "u2", consumedAt: new Date(), revokedAt: null });
    await expect(revokeInvitation("i1")).rejects.toMatchObject({ code: "INVITATION_STATE_CONFLICT", status: 409 });
  });
});
