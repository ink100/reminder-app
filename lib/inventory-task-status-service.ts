import { buildTaskStatusFromScheduler, type InventoryTaskStatusItem } from "@/lib/inventory-task-status";
import { getSchedulerStatus } from "@/lib/scheduler";
import { getTaskRunLogs } from "@/lib/task-runner";

export async function getInventoryTaskStatuses(): Promise<InventoryTaskStatusItem[]> {
  try {
    const [tasks, logs] = await Promise.all([Promise.resolve(getSchedulerStatus()), getTaskRunLogs()]);
    return buildTaskStatusFromScheduler(tasks, logs);
  } catch {
    return [];
  }
}
