import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
  authSession: { deleteMany: vi.fn() },
  trustedDevice: { updateMany: vi.fn() },
  memberInvitation: { updateMany: vi.fn() },
  pendingTotpEnrollment: { deleteMany: vi.fn() },
  webAuthnChallenge: { updateMany: vi.fn() },
}));
const prismaMock = vi.hoisted(() => ({ $transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { updateMember, revokeMemberAccess } from "@/lib/member-management";

describe("member lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx));
    tx.user.count.mockResolvedValue(2);
    tx.user.update.mockResolvedValue({ id: "member" });
  });

  it("prevents self-disable", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "admin", role: "ADMIN", status: "ACTIVE" });
    await expect(updateMember("admin", "admin", { status: "DISABLED" })).rejects.toThrow(/yourself/i);
  });

  it.each([{ role: "MEMBER" as const }, { status: "DISABLED" as const }])("protects the last active admin from $role$status", async (patch) => {
    tx.user.findUnique.mockResolvedValue({ id: "last", role: "ADMIN", status: "ACTIVE" });
    tx.user.count.mockResolvedValue(1);
    await expect(updateMember("other-admin", "last", patch)).rejects.toThrow(/last active admin/i);
  });

  it("never disables or demotes legacy-admin", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "legacy-admin", role: "ADMIN", status: "ACTIVE" });
    await expect(updateMember("admin", "legacy-admin", { status: "DISABLED" })).rejects.toThrow(/legacy/i);
  });

  it.each(["ACTIVE", "DISABLED"] as const)("does not let an invited member bypass enrollment by changing status to %s", async (status) => {
    tx.user.findUnique.mockResolvedValue({ id: "invited", role: "MEMBER", status: "INVITED" });
    await expect(updateMember("admin", "invited", { status })).rejects.toThrow(/complete enrollment/i);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("disabling revokes sessions and trusted devices while re-enable does not restore them", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "member", role: "MEMBER", status: "ACTIVE" });
    await updateMember("admin", "member", { status: "DISABLED" });
    expect(tx.authSession.deleteMany).toHaveBeenCalledWith({ where: { userId: "member" } });
    expect(tx.trustedDevice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "member", revokedAt: null } }));

    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx));
    tx.user.findUnique.mockResolvedValue({ id: "member", role: "MEMBER", status: "DISABLED" });
    tx.user.update.mockResolvedValue({ id: "member" });
    await updateMember("admin", "member", { status: "ACTIVE" });
    expect(tx.authSession.deleteMany).not.toHaveBeenCalled();
    expect(tx.trustedDevice.updateMany).not.toHaveBeenCalled();
  });

  it("explicit access revocation increments the version before removing sessions and devices", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "member", role: "MEMBER", status: "ACTIVE" });
    await revokeMemberAccess("admin", "member");
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "member" }, data: { securityVersion: { increment: 1 } } });
    expect(tx.authSession.deleteMany).toHaveBeenCalled();
    expect(tx.trustedDevice.updateMany).toHaveBeenCalled();
  });

  it("revoking an invited member disables login, revokes its invite, and clears unfinished enrollment", async () => {
    const now = new Date("2026-07-29T00:00:00Z");
    tx.user.findUnique.mockResolvedValue({ id: "invited", role: "MEMBER", status: "INVITED" });
    await revokeMemberAccess("admin", "invited", now);
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "invited" }, data: expect.objectContaining({ status: "DISABLED", disabledAt: now, securityVersion: { increment: 1 } }) }));
    expect(tx.memberInvitation.updateMany).toHaveBeenCalledWith({ where: { targetUserId: "invited", consumedAt: null, revokedAt: null }, data: { revokedAt: now } });
    expect(tx.pendingTotpEnrollment.deleteMany).toHaveBeenCalledWith({ where: { userId: "invited" } });
    expect(tx.webAuthnChallenge.updateMany).toHaveBeenCalledWith({ where: { userId: "invited", consumedAt: null }, data: { consumedAt: now } });
  });

  it.each([
    ["legacy-admin", "legacy-admin", { id: "legacy-admin", role: "ADMIN", status: "ACTIVE" }, /legacy/i],
    ["current actor", "admin", { id: "admin", role: "ADMIN", status: "ACTIVE" }, /yourself/i],
  ])("protects %s from revoke-access", async (_label, targetId, target, message) => {
    tx.user.findUnique.mockResolvedValue(target);
    await expect(revokeMemberAccess("admin", targetId)).rejects.toThrow(message);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("protects the last active admin from revoke-access", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "last", role: "ADMIN", status: "ACTIVE" });
    tx.user.count.mockResolvedValue(1);
    await expect(revokeMemberAccess("other-admin", "last")).rejects.toThrow(/last active admin/i);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
