import { decryptText, encryptText } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { generateOtpSecret, generateOtpSetupPayload, verifyOtpTokenDetails } from "@/lib/otp";
import { hashInvitationToken } from "@/lib/member-invitations";
import { createSessionInTransaction, issueSessionToken } from "@/lib/session";

export const INVALID_INVITATION = "Invitation is invalid or expired";
const PENDING_TTL_MS = 10 * 60_000;

type InvitationWithTarget = Awaited<ReturnType<typeof findInvitation>>;

async function findInvitation(token: string) {
  return prisma.memberInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: { targetUser: true },
  });
}

function requireValid(invitation: InvitationWithTarget, now: Date) {
  if (!invitation || invitation.expiresAt <= now || invitation.revokedAt || invitation.consumedAt || invitation.targetUser.status !== "INVITED") {
    throw new Error(INVALID_INVITATION);
  }
  return invitation;
}

export async function getInvitationTarget(token: string, now = new Date()) {
  return requireValid(await findInvitation(token), now);
}

export async function getInvitationPublicDetails(token: string, now = new Date()) {
  const invitation = await getInvitationTarget(token, now);
  return { displayName: invitation.targetUser.displayName, username: invitation.targetUser.username, expiresAt: invitation.expiresAt };
}

export async function setupInvitationTotp(token: string, now = new Date()) {
  const invitation = requireValid(await findInvitation(token), now);
  const secret = generateOtpSecret();
  const pending = await prisma.$transaction(async (tx) => {
    await tx.pendingTotpEnrollment.deleteMany({ where: { userId: invitation.targetUserId } });
    const enrollment = await tx.pendingTotpEnrollment.create({
      data: { userId: invitation.targetUserId, secretEncrypted: encryptText(secret), expiresAt: new Date(now.getTime() + PENDING_TTL_MS), createdAt: now },
    });
    await tx.webAuthnChallenge.updateMany({ where: { userId: invitation.targetUserId, consumedAt: null }, data: { consumedAt: now } });
    return enrollment;
  });
  const payload = await generateOtpSetupPayload(secret, invitation.targetUser.displayName || invitation.targetUser.username);
  return { ...payload, enrollmentId: pending.id };
}

export async function completeInvitationTotp(
  token: string,
  code: string,
  enrollmentId: string,
  options: { ipAddress?: string | null; userAgent?: string | null } = {},
  now = new Date(),
) {
  const invitation = requireValid(await findInvitation(token), now);
  const pending = await prisma.pendingTotpEnrollment.findUnique({ where: { userId: invitation.targetUserId } });
  if (!pending || pending.id !== enrollmentId || pending.consumedAt || pending.expiresAt <= now) throw new Error(INVALID_INVITATION);
  const verification = await verifyOtpTokenDetails(decryptText(pending.secretEncrypted), code);
  if (!verification.valid) throw new Error(INVALID_INVITATION);

  const sessionIssue = issueSessionToken(now);
  await prisma.$transaction(async (tx) => {
    const factor = await tx.userTotpFactor.upsert({
      where: { userId: invitation.targetUserId },
      create: { userId: invitation.targetUserId, secretEncrypted: pending.secretEncrypted, lastAcceptedStep: verification.timeStep },
      update: { secretEncrypted: pending.secretEncrypted, revokedAt: null, enabledAt: now, lastAcceptedStep: verification.timeStep },
    });
    void factor;
    const activated = await tx.user.updateMany({ where: { id: invitation.targetUserId, status: "INVITED" }, data: { status: "ACTIVE", activatedAt: now, disabledAt: null } });
    const consumedInvite = await tx.memberInvitation.updateMany({ where: { id: invitation.id, consumedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
    const consumedPending = await tx.pendingTotpEnrollment.updateMany({ where: { id: pending.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
    if (activated.count !== 1 || consumedInvite.count !== 1 || consumedPending.count !== 1) throw new Error(INVALID_INVITATION);
    await tx.pendingTotpEnrollment.deleteMany({ where: { userId: invitation.targetUserId, id: { not: pending.id } } });
    await tx.webAuthnChallenge.updateMany({ where: { userId: invitation.targetUserId, consumedAt: null }, data: { consumedAt: now } });
    await createSessionInTransaction(tx, {
      userId: invitation.targetUserId,
      authMethod: "totp",
      securityVersion: invitation.targetUser.securityVersion,
      issue: sessionIssue,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
    });
  });
  return { userId: invitation.targetUserId, sessionToken: sessionIssue.token };
}
