import { describe, expect, it } from "vitest";

import { inventoryWatchSettingsSchema } from "@/lib/validators/inventory-watch";

describe("inventoryWatchSettingsSchema", () => {
  it("accepts notify switch with min/max thresholds", () => {
    const result = inventoryWatchSettingsSchema.parse({
      notifyEnabled: true,
      minNotifyStock: 0,
      maxNotifyStock: 99999,
    });

    expect(result).toEqual({
      notifyEnabled: true,
      minNotifyStock: 0,
      maxNotifyStock: 99999,
    });
  });

  it("rejects min greater than max", () => {
    expect(() =>
      inventoryWatchSettingsSchema.parse({
        notifyEnabled: true,
        minNotifyStock: 10,
        maxNotifyStock: 5,
      }),
    ).toThrow("最小库存不能大于最大库存");
  });
});
