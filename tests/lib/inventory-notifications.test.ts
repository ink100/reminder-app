import { describe, expect, it } from "vitest";

import { collectInventoryNotifications, adaptChangePercent, shouldNotifyItem } from "@/lib/inventory-notifications";
import type { InventoryNotificationCandidate, InventoryNotificationContext } from "@/lib/inventory-notifications";

// UTC 13:00 = 北京时间 21:00，在 9~22 范围内
const inRangeCtx: InventoryNotificationContext = {
  now: new Date("2026-04-27T13:00:00Z"),
  notifyStartHour: 9,
  notifyEndHour: 22,
};

// UTC 14:00 = 北京时间 22:00，在 9~22 范围外（>=22 排除）
const outOfHoursCtx: InventoryNotificationContext = {
  now: new Date("2026-04-27T14:00:00Z"),
  notifyStartHour: 9,
  notifyEndHour: 22,
};

const makeItem = (overrides: Partial<InventoryNotificationCandidate> = {}): InventoryNotificationCandidate => ({
  id: "1",
  name: "Grok AI 账号",
  sourceLabel: "库存源",
  stock: 53,
  notifyEnabled: true,
  minNotifyStock: 1,
  maxNotifyStock: 100,
  lastRangeMatched: false,
  lastNotifiedStock: null,
  lastNotifiedAt: null,
  notifyCooldownMin: 120,
  changePercent: 5,
  changePercentAuto: true,
  ...overrides,
});

describe("inventory notifications", () => {
  it("notifies when product enters configured range (no previous state)", () => {
    const result = collectInventoryNotifications([makeItem()], inRangeCtx);
    expect(result).toEqual([{ id: "1", stock: 53 }]);
  });

  it("does not notify outside notification hours", () => {
    const result = collectInventoryNotifications([makeItem()], outOfHoursCtx);
    expect(result).toEqual([]);
  });

  it("respects cooldown period for small changes", () => {
    // lastNotifiedAt 是 30 分钟前（相对于 inRangeCtx.now）
    const thirtyMinAgo = new Date(inRangeCtx.now.getTime() - 30 * 60 * 1000).toISOString();
    const item = makeItem({
      lastNotifiedAt: thirtyMinAgo,
      lastNotifiedStock: 50,
      stock: 51, // +2%
      notifyCooldownMin: 120,
      changePercent: 5,
    });
    const result = shouldNotifyItem(item, inRangeCtx);
    expect(result).toBe(false);
  });

  it("ignores cooldown when change exceeds threshold", () => {
    const thirtyMinAgo = new Date(inRangeCtx.now.getTime() - 30 * 60 * 1000).toISOString();
    const item = makeItem({
      lastNotifiedAt: thirtyMinAgo,
      lastNotifiedStock: 50,
      stock: 80, // +37.5%, threshold is 20%
      notifyCooldownMin: 120,
      changePercent: 20,
    });
    const result = shouldNotifyItem(item, inRangeCtx);
    expect(result).toBe(true);
  });

  it("notifies when cooldown period has passed", () => {
    const threeHoursAgo = new Date(inRangeCtx.now.getTime() - 180 * 60 * 1000).toISOString();
    const item = makeItem({
      lastNotifiedAt: threeHoursAgo,
      lastNotifiedStock: 50,
      stock: 51, // small change
      notifyCooldownMin: 120,
      changePercent: 5,
    });
    const result = shouldNotifyItem(item, inRangeCtx);
    expect(result).toBe(true);
  });

  it("does not notify when disabled or out of range", () => {
    const item = makeItem({ notifyEnabled: false });
    const result = shouldNotifyItem(item, inRangeCtx);
    expect(result).toBe(false);
  });

  it("skips out-of-range products", () => {
    const item = makeItem({ stock: 0, minNotifyStock: 1 });
    const result = shouldNotifyItem(item, inRangeCtx);
    expect(result).toBe(false);
  });
});

describe("adaptChangePercent", () => {
  it("raises threshold when change is larger than current", () => {
    // current 5%, stock changed from 50 to 10 (80%)
    const result = adaptChangePercent(5, true, 10, 50);
    expect(result).toBeGreaterThan(5);
    expect(result).toBe(64); // 80% * 0.8 = 64%
  });

  it("decays towards default when changes are small", () => {
    // current 50% (manually inflated), stock changed from 50 to 51 (1.9%)
    const result = adaptChangePercent(50, true, 51, 50);
    expect(result).toBe(48); // Math.round(50 * 0.95) = 48
  });

  it("does not go below default", () => {
    const result = adaptChangePercent(5, true, 51, 50);
    expect(result).toBe(5);
  });

  it("does not adapt when auto is disabled", () => {
    const result = adaptChangePercent(10, false, 10, 50);
    expect(result).toBe(10);
  });
});
