type ActorWithRole = { user: { role: string } };

export function hasRole(actor: ActorWithRole | null | undefined, role: "ADMIN" | "MEMBER") {
  return actor?.user.role === role;
}

export function requireAdmin<T extends ActorWithRole>(actor: T): T {
  if (!hasRole(actor, "ADMIN")) throw new Error("Forbidden");
  return actor;
}
