"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export type ShellActor = { username: string; displayName: string; role: string };

export function TopNav({ actor }: { actor: ShellActor }) {
  const router = useRouter();
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/auth");
    router.refresh();
  }
  return (
    <header className="flex min-w-0 items-center justify-between gap-2 px-1 py-2">
      <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-600">{actor.displayName || actor.username}</p><p className="text-xs text-slate-400">{actor.role === "ADMIN" ? "管理员" : "成员"}</p></div>
      <div className="flex items-center gap-2"><Link href="/account" className="min-h-11 rounded-lg px-3 py-3 text-sm text-slate-600 hover:bg-slate-100">账户</Link><button onClick={handleLogout} aria-label="退出登录（撤销全部登录设备）" title="退出会撤销全部登录设备" className="min-h-11 rounded-lg px-3 text-sm text-red-600 hover:bg-red-50">退出全部设备</button></div>
    </header>
  );
}
