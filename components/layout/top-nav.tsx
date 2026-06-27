"use client";

import { useRouter } from "next/navigation";

export function TopNav() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/auth");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between px-1 py-2">
      <div>
        <h2 className="text-sm font-medium text-slate-400">第一版项目骨架</h2>
        <p className="text-xs text-slate-300">轻量部署 · SQLite · OTP 保护</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-medium text-emerald-600 md:inline">
          MVP
        </span>
        <button
          onClick={handleLogout}
          aria-label="退出登录"
          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 md:hidden"
        >
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </header>
  );
}
