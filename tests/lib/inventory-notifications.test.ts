import { describe, expect, it } from "vitest";

import { collectInventoryNotifications } from "@/lib/inventory-notifications";

describe("inventory notifications", () => {
  it("notifies when product enters configured range", () => {
    const result = collectInventoryNotifications([
      {
        id: "1",
        name: "Grok AI 账号",
        sourceLabel: "普货店",
        stock: 53,
        notifyEnabled: true,
        minNotifyStock: 1,
        maxNotifyStock: 100,
        lastRangeMatched: false,
        lastNotifiedStock: null,
      },
    ]);

    expect(result).toEqual([{ id: "1", stock: 53 }]);
  });

  it("does not notify repeatedly when stock stays same in range", () => {
    const result = collectInventoryNotifications([
      {
        id: "1",
        name: "Grok AI 账号",
        sourceLabel: "普货店",
        stock: 53,
        notifyEnabled: true,
        minNotifyStock: 1,
        maxNotifyStock: 100,
        lastRangeMatched: true,
        lastNotifiedStock: 53,
      },
    ]);

    expect(result).toEqual([]);
  });

  it("notifies again when stock changes while still in range", () => {
    const result = collectInventoryNotifications([
      {
        id: "1",
        name: "Grok AI 账号",
        sourceLabel: "普货店",
        stock: 54,
        notifyEnabled: true,
        minNotifyStock: 1,
        maxNotifyStock: 100,
        lastRangeMatched: true,
        lastNotifiedStock: 53,
      },
    ]);

    expect(result).toEqual([{ id: "1", stock: 54 }]);
  });

  it("does not notify when disabled or out of range", () => {
    const result = collectInventoryNotifications([
      {
        id: "1",
        name: "Grok AI 账号",
        sourceLabel: "普货店",
        stock: 0,
        notifyEnabled: true,
        minNotifyStock: 1,
        maxNotifyStock: 100,
        lastRangeMatched: false,
        lastNotifiedStock: null,
      },
      {
        id: "2",
        name: "Gemini 年卡",
        sourceLabel: "群主店",
        stock: 10,
        notifyEnabled: false,
        minNotifyStock: 0,
        maxNotifyStock: 99999,
        lastRangeMatched: false,
        lastNotifiedStock: null,
      },
    ]);

    expect(result).toEqual([]);
  });
});
