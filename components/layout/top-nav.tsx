export function TopNav() {
  return (
    <header className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div>
        <p className="text-sm text-slate-500">轻量部署 · SQLite · OTP 保护</p>
        <h2 className="text-lg font-semibold text-slate-950">第一版项目骨架</h2>
      </div>
      <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
        MVP Skeleton
      </div>
    </header>
  );
}
