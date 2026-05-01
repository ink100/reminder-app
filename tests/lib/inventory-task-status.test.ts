import { describe, expect, it } from "vitest";

import { buildTaskStatusFromScheduler } from "@/lib/inventory-task-status";

describe("inventory task status view", () => {
  it("formats scheduler tasks with latest run log", () => {
    const result = buildTaskStatusFromScheduler(
      [
        { name: "inventory-check", label: "库存通知检查", running: true },
        { name: "reminder-email", label: "到期提醒邮件", running: false },
      ],
      [{ task: "inventory-check", startedAt: "2026-04-27T09:09:30.000Z", success: false }],
    );

    expect(result).toEqual([
      {
        id: "inventory-check",
        label: "库存通知检查",
        enabled: true,
        stateText: "运行中",
        lastStatusText: "失败",
        lastRunAt: "2026-04-27T09:09:30.000Z",
      },
      {
        id: "reminder-email",
        label: "到期提醒邮件",
        enabled: false,
        stateText: "已暂停",
        lastStatusText: "未执行",
        lastRunAt: null,
      },
    ]);
  });
});
