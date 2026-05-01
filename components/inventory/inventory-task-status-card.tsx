import type { InventoryTaskStatusItem } from "@/lib/inventory-task-status";

function formatTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function getStateBadgeClass(item: InventoryTaskStatusItem) {
  if (!item.enabled || item.stateText.includes("暂停")) {
    return "bg-slate-100 text-slate-600 ring-slate-200";
  }

  if (item.lastStatusText === "失败") {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  if (item.lastStatusText === "成功") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  return "bg-amber-50 text-amber-700 ring-amber-200";
}

function getCardClass(item: InventoryTaskStatusItem) {
  if (!item.enabled || item.stateText.includes("暂停")) {
    return "border-slate-200 bg-slate-50";
  }

  if (item.lastStatusText === "失败") {
    return "border-red-200 bg-red-50/60";
  }

  if (item.lastStatusText === "成功") {
    return "border-emerald-200 bg-emerald-50/60";
  }

  return "border-amber-200 bg-amber-50/60";
}

export function InventoryTaskStatusCard({ items }: { items: InventoryTaskStatusItem[] }) {
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
      <div>
        <p className="text-sm text-slate-500">定时任务状态</p>
        <h2 className="text-lg font-semibold text-slate-950">库存同步 / 通知任务</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className={`rounded-xl border p-4 text-sm ${getCardClass(item)}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-slate-900">{item.label}</div>
              <span className={`rounded-full px-2 py-1 text-xs ring-1 ${getStateBadgeClass(item)}`}>{item.stateText}</span>
            </div>
            <div className="mt-3 space-y-1 text-slate-700">
              <div>上次结果：{item.lastStatusText}</div>
              <div>上次执行：{formatTime(item.lastRunAt)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
