"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { getNavigationItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function MobileNav({ role }: { role: string }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const items = getNavigationItems(role);
  const primaryItems = items.slice(0, 4);
  const moreItems = items.slice(4);
  const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {moreOpen ? <div className="fixed inset-0 z-[60] bg-slate-950/40 md:hidden" role="presentation" onClick={() => setMoreOpen(false)}><section role="dialog" aria-modal="true" aria-label="更多导航" onClick={(event) => event.stopPropagation()} className="absolute inset-x-3 bottom-20 max-h-[70dvh] overflow-y-auto rounded-2xl bg-white p-3 shadow-xl"><div className="grid grid-cols-2 gap-2">{moreItems.map((item) => <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)} className={cn("min-h-11 rounded-xl px-3 py-3 text-sm", matches(item.href) ? "bg-blue-50 text-blue-600" : "text-slate-600")}>{item.shortLabel}</Link>)}</div></section></div> : null}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="主导航"><div className="grid grid-cols-5">{primaryItems.map((item) => <Link key={item.href} href={item.href} aria-current={matches(item.href) ? "page" : undefined} className={cn("flex min-h-[3.75rem] items-center justify-center px-1 text-xs", matches(item.href) ? "text-blue-600" : "text-slate-500")}>{item.shortLabel}</Link>)}<button onClick={() => setMoreOpen(true)} className="min-h-[3.75rem] text-xs text-slate-500">更多</button></div></nav>
    </>
  );
}
