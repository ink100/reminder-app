type Actor = { userId: string; user: { role: string } } | null | undefined;

/** Both roles may manage security, but only for their own user id. */
export function selfSecurityAuthorizationStatus(actor: Actor, targetUserId: string): 401 | 403 | null {
  if (!actor) return 401;
  if (actor.userId !== targetUserId) return 403;
  return actor.user.role === "ADMIN" || actor.user.role === "MEMBER" ? null : 403;
}
