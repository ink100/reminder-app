import type { ReactNode } from "react";
import { requireAdminPage } from "@/lib/auth";
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireAdminPage();
  return children;
}
