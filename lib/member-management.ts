import { MemberDomainError } from "@/lib/member-domain-error";
import { prisma } from "@/lib/prisma";

export const LEGACY_ADMIN_ID = "legacy-admin";
export type MemberPatch = { role?: "ADMIN" | "MEMBER"; status?: "ACTIVE" | "DISABLED" };

export async function listMembers() {
  return prisma.user.findMany({
    select: { id: true, username: true, displayName: true, role: true, status: true, activatedAt: true, disabledAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function updateMember(actorUserId: string, targetUserId: string, patch: MemberPatch, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: targetUserId }, select: { id: true, role: true, status: true } });
    if (!target) throw new MemberDomainError("MEMBER_NOT_FOUND", "Member not found", 404);
    if (target.status === "INVITED" && patch.status !== undefined) {
      throw new MemberDomainError("MEMBER_STATE_CONFLICT", "Invited members must complete enrollment before activation or disablement", 409);
    }
    if (targetUserId === LEGACY_ADMIN_ID && (patch.role === "MEMBER" || patch.status === "DISABLED")) throw new MemberDomainError("PROTECTED_MEMBER", "legacy-admin is protected", 409);
    if (actorUserId === targetUserId && patch.status === "DISABLED") throw new MemberDomainError("SELF_ACTION_FORBIDDEN", "You cannot disable yourself", 409);

    const removesActiveAdmin = target.role === "ADMIN" && target.status === "ACTIVE" && (patch.role === "MEMBER" || patch.status === "DISABLED");
    if (removesActiveAdmin) {
      const activeAdmins = await tx.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
      if (activeAdmins <= 1) throw new MemberDomainError("LAST_ADMIN", "Cannot modify the last active admin", 409);
    }

    const disabling = target.status !== "DISABLED" && patch.status === "DISABLED";
    const activating = target.status !== "ACTIVE" && patch.status === "ACTIVE";
    const user = await tx.user.update({
      where: { id: targetUserId },
      data: {
        ...patch,
        ...(disabling ? { disabledAt: now, securityVersion: { increment: 1 } } : {}),
        ...(activating ? { disabledAt: null, activatedAt: now } : {}),
      },
    });
    if (disabling) {
      await tx.authSession.deleteMany({ where: { userId: targetUserId } });
      await tx.trustedDevice.updateMany({ where: { userId: targetUserId, revokedAt: null }, data: { revokedAt: now } });
    }
    return user;
  });
}

export async function revokeMemberAccess(actorUserId: string, userId: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true } });
    if (!target) throw new MemberDomainError("MEMBER_NOT_FOUND", "Member not found", 404);
    if (userId === LEGACY_ADMIN_ID) throw new MemberDomainError("PROTECTED_MEMBER", "legacy-admin is protected", 409);
    if (actorUserId === userId) throw new MemberDomainError("SELF_ACTION_FORBIDDEN", "You cannot revoke access for yourself", 409);
    if (target.role === "ADMIN" && target.status === "ACTIVE") {
      const activeAdmins = await tx.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
      if (activeAdmins <= 1) throw new MemberDomainError("LAST_ADMIN", "Cannot revoke the last active admin", 409);
    }

    const invited = target.status === "INVITED";
    await tx.user.update({
      where: { id: userId },
      data: { securityVersion: { increment: 1 }, ...(invited ? { status: "DISABLED", disabledAt: now } : {}) },
    });
    if (invited) {
      await tx.memberInvitation.updateMany({ where: { targetUserId: userId, consumedAt: null, revokedAt: null }, data: { revokedAt: now } });
      await tx.pendingTotpEnrollment.deleteMany({ where: { userId } });
      await tx.webAuthnChallenge.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: now } });
    }
    await tx.authSession.deleteMany({ where: { userId } });
    await tx.trustedDevice.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
  });
}
