import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/session";
import { hasTrustedDeviceCookie } from "@/lib/trusted-device";

export async function requirePageSession() {
  const session = await getCurrentSession();

  if (!session) {
    if (await hasTrustedDeviceCookie()) {
      redirect("/api/auth/trusted/restore?next=/reminders");
    }

    redirect("/auth");
  }

  return session;
}

export async function requireApiSession() {
  const session = await getCurrentSession();

  if (!session) {
    return null;
  }

  return session;
}

export async function requireAdminApiSession() {
  const session = await getCurrentSession();
  return session?.user.role === "ADMIN" ? session : null;
}

export async function requireAdminPage() {
  const session = await requirePageSession();
  if (session.user.role !== "ADMIN") redirect("/reminders");
  return session;
}
