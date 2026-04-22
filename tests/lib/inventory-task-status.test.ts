import { describe, expect, it } from "vitest";

import { buildInventoryTaskStatusView } from "@/lib/inventory-task-status";

describe("inventory task status view", () => {
  it("formats configured cron jobs into page-friendly task cards", () => {
    const result = buildInventoryTaskStatusView([
      {
        job_id: "d749087a2bd3",
        name: "inventory-sync-general-every-1m",
        schedule: "every 1m",
        enabled: true,
        next_run_at: "2026-04-22T13:42:21.706455+08:00",
        last_run_at: "2026-04-22T13:41:21.706455+08:00",
        last_status: "success",
      },
      {
        job_id: "865b1de7c0aa",
        name: "inventory-sync-owner-every-3m",
        schedule: "every 3m",
        enabled: true,
        next_run_at: "2026-04-22T13:44:22.710221+08:00",
        last_run_at: null,
        last_status: null,
      },
    ]);

    expect(result).toEqual([
      {
        id: "d749087a2bd3",
        label: "普货店同步",
        schedule: "every 1m",
        enabled: true,
        stateText: "运行中",
        lastStatusText: "成功",
        nextRunAt: "2026-04-22T13:42:21.706455+08:00",
        lastRunAt: "2026-04-22T13:41:21.706455+08:00",
      },
      {
        id: "865b1de7c0aa",
        label: "群主店同步",
        schedule: "every 3m",
        enabled: true,
        stateText: "运行中",
        lastStatusText: "未执行",
        nextRunAt: "2026-04-22T13:44:22.710221+08:00",
        lastRunAt: null,
      },
    ]);
  });

  it("supports object schedule payload from jobs.json", () => {
    const result = buildInventoryTaskStatusView([
      {
        id: "373d8ec5a96b",
        name: "inventory-check-notify-every-1m",
        schedule: { display: "every 1m" },
        enabled: true,
        next_run_at: "2026-04-22T13:46:08.093823+08:00",
        last_run_at: "2026-04-22T13:45:08.093823+08:00",
        last_status: "ok",
      },
    ]);

    expect(result[0]?.schedule).toBe("every 1m");
  });
});
