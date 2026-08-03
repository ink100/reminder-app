import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const createInvitation = vi.hoisted(() => vi.fn());
const revokeInvitation = vi.hoisted(() => vi.fn());
const updateMember = vi.hoisted(() => vi.fn());
const revokeMemberAccess = vi.hoisted(() => vi.fn());
const tx = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  userTotpFactor: { deleteMany: vi.fn() },
  webAuthnCredential: { deleteMany: vi.fn() },
  authSession: { deleteMany: vi.fn() },
  trustedDevice: { deleteMany: vi.fn() },
  pendingTotpEnrollment: { deleteMany: vi.fn() },
  webAuthnChallenge: { updateMany: vi.fn() },
}));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  memberInvitation: { findMany: vi.fn() },
}));

vi.mock("@/lib/admin-member-api", () => ({ requireAdminMemberApi: authMock }));
vi.mock("@/lib/member-invitations", () => ({ createMemberInvitation: createInvitation, revokeInvitation }));
vi.mock("@/lib/member-management", () => ({ listMembers: vi.fn(), updateMember, revokeMemberAccess }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST as createMember } from "@/server/handlers/api/admin/members/route";
import { PATCH as patchMember } from "@/server/handlers/api/admin/members/[id]/route";
import { POST as revokeAccess } from "@/server/handlers/api/admin/members/[id]/revoke-access/route";
import { DELETE as revokeInvite } from "@/server/handlers/api/admin/member-invitations/[id]/route";
import { MemberDomainError } from "@/lib/member-domain-error";

const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe("admin member routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ actor: { userId: "actor-42" }, response: null });
    prismaMock.$transaction.mockImplementation((fn: (db: typeof tx) => unknown) => fn(tx));
    createInvitation.mockResolvedValue({ id: "invite-1", token: "fresh-token", expiresAt: new Date("2026-08-01T00:00:00Z") });
  });

  it("passes the authenticated actor id through PATCH and revoke-access routes", async () => {
    updateMember.mockResolvedValue({ id: "member-1" });
    revokeMemberAccess.mockResolvedValue(undefined);
    await patchMember(new Request("https://test/api/admin/members/member-1", { method: "PATCH", body: JSON.stringify({ role: "MEMBER" }), headers: { "content-type": "application/json" } }), context("member-1"));
    await revokeAccess(new Request("https://test/api/admin/members/member-1/revoke-access", { method: "POST" }), context("member-1"));
    expect(updateMember).toHaveBeenCalledWith("actor-42", "member-1", { role: "MEMBER" });
    expect(revokeMemberAccess).toHaveBeenCalledWith("actor-42", "member-1");
  });

  it("passes actor id to invitation creation and resets all authentication ownership for a disabled user", async () => {
    tx.user.findUnique.mockResolvedValue({ id: "member-1", username: "alice", status: "DISABLED" });
    tx.user.update.mockResolvedValue({ id: "member-1", username: "alice", status: "INVITED" });
    const response = await createMember(new Request("https://test/api/admin/members", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "alice", displayName: "Alice", role: "MEMBER", expiresInHours: 24 }),
    }));
    expect(response.status).toBe(201);
    expect(createInvitation).toHaveBeenCalledWith(expect.objectContaining({ targetUserId: "member-1", invitedById: "actor-42" }), tx, expect.any(Date));
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "member-1" },
      data: expect.objectContaining({ status: "INVITED", securityVersion: { increment: 1 } }),
    }));
    expect(tx.userTotpFactor.deleteMany).toHaveBeenCalledWith({ where: { userId: "member-1" } });
    expect(tx.webAuthnCredential.deleteMany).toHaveBeenCalledWith({ where: { userId: "member-1" } });
    expect(tx.authSession.deleteMany).toHaveBeenCalledWith({ where: { userId: "member-1" } });
    expect(tx.trustedDevice.deleteMany).toHaveBeenCalled();
    expect(tx.pendingTotpEnrollment.deleteMany).toHaveBeenCalled();
    expect(tx.webAuthnChallenge.updateMany).toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON rather than treating it as an internal error", async () => {
    const createResponse = await createMember(new Request("https://test/api/admin/members", { method: "POST", body: "{" }));
    const patchResponse = await patchMember(new Request("https://test/api/admin/members/member-1", { method: "PATCH", body: "{" }), context("member-1"));
    expect(createResponse.status).toBe(400);
    expect(patchResponse.status).toBe(400);
  });

  it("does not expose unknown internal errors as business conflicts", async () => {
    revokeMemberAccess.mockRejectedValue(new Error("database connection failed"));
    const response = await revokeAccess(new Request("https://test", { method: "POST" }), context("member-1"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Unable to revoke access" });
  });

  it.each([
    ["missing", new MemberDomainError("INVITATION_NOT_FOUND", "Invitation not found", 404), 404],
    ["consumed", new MemberDomainError("INVITATION_STATE_CONFLICT", "Invitation is not pending", 409), 409],
  ])("maps %s invitation revocation through structured domain errors", async (_label, error, status) => {
    revokeInvitation.mockRejectedValue(error);
    const response = await revokeInvite(new Request("https://test", { method: "DELETE" }), context("invite-1"));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ code: error.code });
  });
});
