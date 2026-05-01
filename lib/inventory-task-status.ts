export type InventoryTaskStatusItem = {
  id: string;
  label: string;
  enabled: boolean;
  stateText: string;
  lastStatusText: string;
  lastRunAt: string | null;
};

const taskLabels: Record<string, string> = {
  "inventory-check": "库存通知检查",
  "reminder-email": "到期提醒邮件",
};

export function buildTaskStatusFromScheduler(
  tasks: { name: string; label: string; running: boolean }[],
  logs: { task: string; startedAt: string; success: boolean }[],
): InventoryTaskStatusItem[] {
  // 按 task 分组取最新的那条记录
  const latestLogs = new Map<string, { startedAt: string; success: boolean }>();
  for (const log of logs) {
    const existing = latestLogs.get(log.task);
    if (!existing || log.startedAt > existing.startedAt) {
      latestLogs.set(log.task, { startedAt: log.startedAt, success: log.success });
    }
  }

  return tasks.map((task) => {
    const lastLog = latestLogs.get(task.name);
    return {
      id: task.name,
      label: taskLabels[task.name] ?? task.label,
      enabled: task.running,
      stateText: task.running ? "运行中" : "已暂停",
      lastStatusText: lastLog ? (lastLog.success ? "成功" : "失败") : "未执行",
      lastRunAt: lastLog?.startedAt ?? null,
    };
  });
}
