import Link from "next/link";

export function SideNav() {
  return (
    <aside className="hidden w-56 shrink-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:block">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Reminder App</p>
        <h1 className="mt-2 text-lg font-semibold text-slate-950">到期提醒</h1>
      </div>
      <nav className="space-y-2 text-sm text-slate-700">
        <Link className="block rounded-lg px-3 py-2 hover:bg-slate-100" href="/reminders">
          提醒首页
        </Link>
        <Link className="block rounded-lg px-3 py-2 hover:bg-slate-100" href="/inventory">
          库存监控
        </Link>
        <Link className="block rounded-lg px-3 py-2 hover:bg-slate-100" href="/license-key">
          激活密匙
        </Link>
        <Link className="block rounded-lg px-3 py-2 hover:bg-slate-100" href="/settings">
          配置中心
        </Link>
      </nav>
    </aside>
  );
}
