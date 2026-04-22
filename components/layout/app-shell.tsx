import type { ReactNode } from "react";

import { SideNav } from "@/components/layout/side-nav";
import { TopNav } from "@/components/layout/top-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-6 md:px-6">
        <SideNav />
        <div className="flex min-h-full min-w-0 flex-1 flex-col gap-6">
          <TopNav />
          <main className="flex-1 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
