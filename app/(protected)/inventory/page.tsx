import { InventoryDashboard } from "@/components/inventory/inventory-dashboard";
import { InventoryTaskStatusCard } from "@/components/inventory/inventory-task-status-card";
import { ensureInventoryData } from "@/lib/inventory-service";
import { getInventoryTaskStatuses } from "@/lib/inventory-task-status-service";

export default async function InventoryPage() {
  const [items, taskStatuses] = await Promise.all([ensureInventoryData(), getInventoryTaskStatuses()]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">库存监控</p>
        <h1 className="text-2xl font-semibold text-slate-950">普货店主商品监控</h1>
        <p className="text-sm text-slate-500">群主店库存作为同款参考展示，但通知与查看都以普货店主商品为准。</p>
      </div>
      <InventoryTaskStatusCard items={taskStatuses} />
      <InventoryDashboard initialItems={items} />
    </div>
  );
}
