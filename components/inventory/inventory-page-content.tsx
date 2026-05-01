import { InventoryDashboard } from "@/components/inventory/inventory-dashboard";
import { InventoryTaskStatusCard } from "@/components/inventory/inventory-task-status-card";
import { ensureInventoryData } from "@/lib/inventory-service";
import { getInventoryTaskStatuses } from "@/lib/inventory-task-status-service";

export async function InventoryPageContent() {
  const [items, taskStatuses] = await Promise.all([ensureInventoryData(), getInventoryTaskStatuses()]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">库存监控</p>
        <h1 className="text-2xl font-semibold text-slate-950">库存商品监控</h1>
        <p className="text-sm text-slate-500">
          普货点抓取已停用；当前页面仅保留现有非普货库存项的通知配置。
        </p>
      </div>
      <InventoryTaskStatusCard items={taskStatuses} />
      <InventoryDashboard initialItems={items} />
    </div>
  );
}
