import { promises as fs } from "node:fs";

import { buildInventoryTaskStatusView, inventoryCronJobsPath, type InventoryCronJobRecord } from "@/lib/inventory-task-status";

export async function getInventoryTaskStatuses() {
  try {
    const raw = await fs.readFile(inventoryCronJobsPath, "utf8");
    const parsed = JSON.parse(raw) as { jobs?: InventoryCronJobRecord[] } | InventoryCronJobRecord[];
    const jobs = Array.isArray(parsed) ? parsed : (parsed.jobs ?? []);
    return buildInventoryTaskStatusView(jobs);
  } catch {
    return [];
  }
}
