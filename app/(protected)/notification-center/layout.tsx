import type { ReactNode } from "react";
import { requireAdminPage } from "@/lib/auth";
export default async function NotificationCenterLayout({ children }: { children: ReactNode }) {
  await requireAdminPage();
  return children;
}
