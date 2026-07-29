"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { getNavigationItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function SideNav({ role }: { role: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const items = getNavigationItems(role);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/auth");
    router.refresh();
  }

  return (
    <aside className="hidden w-56 shrink-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex md:flex-col">
      <div className="mb-6"><p className="text-xs font-semibold uppercase text-slate-400">Reminder App</p><h1 className="mt-2 text-lg font-semibold text-slate-950">到期提醒</h1></div>
      <nav className="flex-1 space-y-1 text-sm">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex items-center rounded-lg px-3 py-2 font-medium", active ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100")}>{item.label}</Link>;
        })}
      </nav>
      <button onClick={handleLogout} className="mt-4 min-h-11 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50">退出登录</button>
    </aside>
  );
}
