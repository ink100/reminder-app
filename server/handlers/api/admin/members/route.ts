import { ZodError } from "zod";

import { requireAdminMemberApi } from "@/lib/admin-member-api";
import { MemberDomainError, memberErrorResponse } from "@/lib/member-domain-error";
import { createMemberInvitation } from "@/lib/member-invitations";
import { listMembers } from "@/lib/member-management";
import { prisma } from "@/lib/prisma";
import { createMemberInviteSchema } from "@/lib/validators/members";

export async function GET() {
  const auth = await requireAdminMemberApi();
  if (auth.response) return auth.response;
  const [members, invitations] = await Promise.all([
    listMembers(),
    prisma.memberInvitation.findMany({
      select: { id: true, targetUserId: true, invitedById: true, expiresAt: true, consumedAt: true, revokedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return Response.json({ members, invitations });
}

export async function POST(request: Request) {
  const auth = await requireAdminMemberApi();
  if (auth.response) return auth.response;
  try {
    const input = createMemberInviteSchema.parse(await request.json());
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({ where: { username: input.username } });
      if (existingUser && existingUser.status !== "INVITED" && existingUser.status !== "DISABLED") {
        throw new MemberDomainError("USERNAME_ALREADY_EXISTS", "Username already exists", 409);
      }
      const restoringDisabled = existingUser?.status === "DISABLED";
      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: { displayName: input.displayName, role: input.role, status: "INVITED", disabledAt: null,
              ...(restoringDisabled ? { securityVersion: { increment: 1 } } : {}) },
          })
        : await tx.user.create({
            data: { username: input.username, displayName: input.displayName, role: input.role, status: "INVITED" },
          });
      if (restoringDisabled) {
        await tx.userTotpFactor.deleteMany({ where: { userId: user.id } });
        await tx.webAuthnCredential.deleteMany({ where: { userId: user.id } });
        await tx.authSession.deleteMany({ where: { userId: user.id } });
        await tx.trustedDevice.deleteMany({ where: { userId: user.id } });
        await tx.pendingTotpEnrollment.deleteMany({ where: { userId: user.id } });
        await tx.webAuthnChallenge.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: now } });
      }
      const invitation = await createMemberInvitation({
        targetUserId: user.id,
        invitedById: auth.actor.userId,
        expiresAt: new Date(now.getTime() + input.expiresInHours * 3_600_000),
      }, tx, now);
      return { user, invitation };
    });
    return Response.json({
      member: result.user,
      invitation: { id: result.invitation.id, expiresAt: result.invitation.expiresAt, token: result.invitation.token },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: "Invalid request", issues: error.issues }, { status: 400 });
    const mapped = memberErrorResponse(error, "Unable to create invitation");
    return Response.json(mapped.body, { status: mapped.status });
  }
}
