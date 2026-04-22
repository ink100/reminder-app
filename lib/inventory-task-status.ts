import path from "node:path";

export type InventoryCronJobRecord = {
  id?: string;
  job_id?: string;
  name: string;
  schedule?: string | { display?: string };
  schedule_display?: string;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  state?: string | null;
};

export type InventoryTaskStatusItem = {
  id: string;
  label: string;
  schedule: string;
  enabled: boolean;
  stateText: string;
  lastStatusText: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
};

const inventoryJobLabels: Record<string, string> = {
  "inventory-sync-general-every-1m": "普货店同步",
  "inventory-sync-owner-every-3m": "群主店同步",
  "inventory-check-notify-every-1m": "库存通知检查",
};

export const inventoryCronJobsPath = path.join(process.env.HOME ?? "/home/agentuser", ".hermes", "cron", "jobs.json");

function toStateText(enabled: boolean, state?: string | null) {
  if (!enabled) {
    return "已暂停";
  }

  if (state === "scheduled" || !state) {
    return "运行中";
  }

  return state;
}

function toLastStatusText(value: string | null) {
  if (!value) {
    return "未执行";
  }

  if (value === "ok" || value === "success") {
    return "成功";
  }

  if (value === "failed" || value === "error") {
    return "失败";
  }

  return value;
}

function toScheduleText(job: InventoryCronJobRecord) {
  if (typeof job.schedule === "string") {
    return job.schedule;
  }

  if (job.schedule && typeof job.schedule === "object" && "display" in job.schedule && typeof job.schedule.display === "string") {
    return job.schedule.display;
  }

  return job.schedule_display ?? "unknown";
}

export function buildInventoryTaskStatusView(jobs: InventoryCronJobRecord[]): InventoryTaskStatusItem[] {
  return jobs
    .filter((job) => job.name in inventoryJobLabels)
    .map((job) => ({
      id: job.job_id ?? job.id ?? job.name,
      label: inventoryJobLabels[job.name] ?? job.name,
      schedule: toScheduleText(job),
      enabled: job.enabled,
      stateText: toStateText(job.enabled, job.state),
      lastStatusText: toLastStatusText(job.last_status),
      nextRunAt: job.next_run_at,
      lastRunAt: job.last_run_at,
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
}
