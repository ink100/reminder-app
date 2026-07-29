import crypto from "node:crypto";

import { env } from "@/lib/env";
import { MemberDomainError } from "@/lib/member-domain-error";
import { prisma } from "@/lib/prisma";

const INVALID_INVITATION = "Invitation is invalid or expired";

export function hashInvitationToken(token: string) {
  return crypto.createHmac("sha256", env.SESSION_SECRET).update("member-invitation\0").update(token).digest("hex");
}

type InvitationDb = Pick<typeof prisma, "memberInvitation" | "pendingTotpEnrollment" | "webAuthnChallenge">;

export async function createMemberInvitation(
  input: { targetUserId: string; invitedById: string; expiresAt: Date },
  db: InvitationDb = prisma,
  now = new Date(),
) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashInvitationToken(token);
  const existing = await db.memberInvitation.findUnique({ where: { targetUserId: input.targetUserId } });
  if (existing && !existing.revokedAt && !existing.consumedAt && existing.expiresAt > now) {
    throw new MemberDomainError("INVITATION_ALREADY_PENDING", "An invitation is already pending", 409);
  }

  let invitation;
  if (existing) {
    const rotated = await db.memberInvitation.updateMany({
      where: { id: existing.id, tokenHash: existing.tokenHash },
      data: { tokenHash, invitedById: input.invitedById, expiresAt: input.expiresAt, revokedAt: null, consumedAt: null, createdAt: now },
    });
    if (rotated.count !== 1) throw new MemberDomainError("INVITATION_STATE_CONFLICT", "Invitation changed while being reissued", 409);
    invitation = await db.memberInvitation.findUnique({ where: { id: existing.id } });
    if (!invitation) throw new Error("Unable to reissue invitation");
    await db.pendingTotpEnrollment.deleteMany({ where: { userId: input.targetUserId } });
    await db.webAuthnChallenge.updateMany({ where: { userId: input.targetUserId, consumedAt: null }, data: { consumedAt: now } });
  } else {
    invitation = await db.memberInvitation.create({
      data: { tokenHash, targetUserId: input.targetUserId, invitedById: input.invitedById, expiresAt: input.expiresAt },
    });
  }
  return { ...invitation, token, tokenHash };
}

export async function redeemInvitation(token: string, now = new Date()) {
  const invitation = await prisma.memberInvitation.findUnique({ where: { tokenHash: hashInvitationToken(token) } });
  if (!invitation || invitation.expiresAt <= now || invitation.revokedAt || invitation.consumedAt) throw new Error(INVALID_INVITATION);
  const consumed = await prisma.memberInvitation.updateMany({
    where: { id: invitation.id, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) throw new Error(INVALID_INVITATION);
  return invitation;
}

export async function revokeInvitation(id: string, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const invitation = await tx.memberInvitation.findUnique({ where: { id } });
    if (!invitation) throw new MemberDomainError("INVITATION_NOT_FOUND", "Invitation not found", 404);
    if (invitation.consumedAt || invitation.revokedAt) {
      throw new MemberDomainError("INVITATION_STATE_CONFLICT", "Invitation is not pending", 409);
    }
    const result = await tx.memberInvitation.updateMany({
      where: { id, consumedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    if (result.count !== 1) throw new MemberDomainError("INVITATION_STATE_CONFLICT", "Invitation is not pending", 409);
    await tx.pendingTotpEnrollment.deleteMany({ where: { userId: invitation.targetUserId } });
    await tx.webAuthnChallenge.updateMany({ where: { userId: invitation.targetUserId, consumedAt: null }, data: { consumedAt: now } });
  });
}
