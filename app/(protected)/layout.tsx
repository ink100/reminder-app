import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { requirePageSession } from "@/lib/auth";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await requirePageSession();

  return <AppShell>{children}</AppShell>;
}
