import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { requirePageSession } from "@/lib/auth";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await requirePageSession();

  return <AppShell actor={{ username: session.user.username, displayName: session.user.displayName, role: session.user.role }}>{children}</AppShell>;
}
