import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/session";

export async function requirePageSession() {
  const session = await getCurrentSession();

  if (!session) {
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
