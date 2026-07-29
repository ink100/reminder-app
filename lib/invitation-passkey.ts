import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";

import { getInvitationTarget, INVALID_INVITATION } from "@/lib/invitation-acceptance";
import { prisma } from "@/lib/prisma";
import { generateRegOptions } from "@/lib/webauthn";
import { hashCeremonyCookie } from "@/lib/webauthn-ceremonies";
import { createSessionInTransaction, issueSessionToken } from "@/lib/session";

const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";
const ORIGIN = process.env.WEBAUTHN_ORIGIN || process.env.APP_BASE_URL || "http://localhost:63456";

export async function generateInvitationPasskeyOptions(token: string, browserToken: string) {
  const invitation = await getInvitationTarget(token);
  return generateRegOptions(invitation.targetUserId, browserToken);
}

export async function completeInvitationPasskey(
  token: string,
  response: RegistrationResponseJSON,
  browserToken: string,
  options: { ipAddress?: string | null; userAgent?: string | null } = {},
  now = new Date(),
) {
  const invitation = await getInvitationTarget(token, now);
  const ceremony = await prisma.webAuthnChallenge.findFirst({
    where: {
      flow: "REGISTRATION",
      userId: invitation.targetUserId,
      browserTokenHash: hashCeremonyCookie(browserToken),
      consumedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!ceremony) throw new Error(INVALID_INVITATION);

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: ceremony.challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: true,
  });
  if (!verification.verified || !verification.registrationInfo) throw new Error(INVALID_INVITATION);
  const { credential } = verification.registrationInfo;

  const sessionIssue = issueSessionToken(now);
  await prisma.$transaction(async (tx) => {
    const consumedCeremony = await tx.webAuthnChallenge.updateMany({
      where: { id: ceremony.id, userId: invitation.targetUserId, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    const consumedInvite = await tx.memberInvitation.updateMany({
      where: { id: invitation.id, targetUserId: invitation.targetUserId, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    const activated = await tx.user.updateMany({
      where: { id: invitation.targetUserId, status: "INVITED" },
      data: { status: "ACTIVE", activatedAt: now, disabledAt: null },
    });
    if (consumedCeremony.count !== 1 || consumedInvite.count !== 1 || activated.count !== 1) throw new Error(INVALID_INVITATION);
    await tx.webAuthnCredential.create({
      data: {
        userId: invitation.targetUserId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64"),
        counter: BigInt(credential.counter),
        credentialType: "public-key",
        authenticatorType: "platform",
        deviceName: "通行密匙",
      },
    });
    await tx.pendingTotpEnrollment.deleteMany({ where: { userId: invitation.targetUserId } });
    await tx.webAuthnChallenge.updateMany({ where: { userId: invitation.targetUserId, id: { not: ceremony.id }, consumedAt: null }, data: { consumedAt: now } });
    await createSessionInTransaction(tx, {
      userId: invitation.targetUserId,
      authMethod: "passkey",
      securityVersion: invitation.targetUser.securityVersion,
      issue: sessionIssue,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
    });
  });
  return { userId: invitation.targetUserId, sessionToken: sessionIssue.token };
}
