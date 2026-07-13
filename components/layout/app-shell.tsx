import type { ReactNode } from "react";

import { MobileNav } from "@/components/layout/mobile-nav";
import { SideNav } from "@/components/layout/side-nav";
import { TopNav } from "@/components/layout/top-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-950">
      <div className="mx-auto flex min-h-dvh max-w-7xl gap-6 px-2 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] min-[360px]:px-4 md:px-6 md:py-6">
        <SideNav />
        <div className="flex min-h-full min-w-0 flex-1 flex-col gap-6">
          <TopNav />
          <main className="flex-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm min-[360px]:p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
