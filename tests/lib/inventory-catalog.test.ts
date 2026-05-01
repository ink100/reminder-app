import { describe, expect, it } from "vitest";

import { buildCanonicalInventoryItems } from "@/lib/inventory-catalog";

const baseItem = {
  externalId: "1",
  name: "ChatGPT Plus",
  stock: 5,
  productUrl: null,
  lastFetchedAt: null,
  notifyEnabled: false,
  minNotifyStock: 0,
  maxNotifyStock: 99999,
  notifyCooldownMin: 120,
  changePercent: 5,
  changePercentAuto: true,
};

describe("inventory catalog", () => {
  it("filters out removed makerich-general items", () => {
    const result = buildCanonicalInventoryItems([
      {
        ...baseItem,
        id: "m-1",
        source: "makerich-general",
        sourceLabel: "已停用来源",
      },
      {
        ...baseItem,
        id: "custom-1",
        source: "custom-source",
        sourceLabel: "库存源",
      },
    ]);

    expect(result.map((item) => item.id)).toEqual(["custom-1"]);
  });
});
