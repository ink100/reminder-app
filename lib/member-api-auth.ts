type Actor = { user: { role: string } } | null | undefined;

export function adminApiAuthorizationStatus(actor: Actor): 401 | 403 | null {
  if (!actor) return 401;
  return actor.user.role === "ADMIN" ? null : 403;
}

export function sharedApiAuthorizationStatus(actor: Actor): 401 | 403 | null {
  if (!actor) return 401;
  return actor.user.role === "ADMIN" || actor.user.role === "MEMBER" ? null : 403;
}
