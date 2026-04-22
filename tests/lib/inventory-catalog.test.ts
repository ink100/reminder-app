import { describe, expect, it } from "vitest";

import { buildCanonicalInventoryItems, normalizeInventoryName } from "@/lib/inventory-catalog";

describe("inventory catalog", () => {
  it("normalizes names so bracket prefixes do not break matching", () => {
    expect(normalizeInventoryName("【质保一月】SuperGrok 独享账号 | 30美金订阅成品号")).toBe(
      normalizeInventoryName("SuperGrok 独享账号 | 30美金订阅成品号"),
    );
  });

  it("uses makerich items as the canonical product list and hides duplicated owner-shop rows", () => {
    const result = buildCanonicalInventoryItems([
      {
        id: "m-1",
        source: "makerich-general",
        sourceLabel: "普货店",
        externalId: "1",
        name: "ChatGPT Plus 代充｜自助充值｜24小时充值",
        stock: 12,
        productUrl: "https://makerich.club/item?id=120",
        lastFetchedAt: "2026-04-22T05:15:40.062Z",
        notifyEnabled: true,
        minNotifyStock: 1,
        maxNotifyStock: 99,
      },
      {
        id: "b-26",
        source: "bmoplus-group-owner",
        sourceLabel: "群主店",
        externalId: "26",
        name: "ChatGPT Plus 代充｜自助充值｜24小时充值",
        stock: 0,
        productUrl: "https://shop.bmoplus.com/shop/commodityDetails?id=26",
        lastFetchedAt: "2026-04-22T05:12:00.000Z",
        notifyEnabled: false,
        minNotifyStock: 0,
        maxNotifyStock: 99999,
      },
      {
        id: "m-2",
        source: "makerich-general",
        sourceLabel: "普货店",
        externalId: "2",
        name: "SuperGrok 独享账号 | 30美金订阅成品号",
        stock: 4,
        productUrl: "https://makerich.club/item?id=129",
        lastFetchedAt: "2026-04-22T05:15:40.062Z",
        notifyEnabled: false,
        minNotifyStock: 0,
        maxNotifyStock: 99999,
      },
      {
        id: "b-77",
        source: "bmoplus-group-owner",
        sourceLabel: "群主店",
        externalId: "77",
        name: "【质保一月】SuperGrok 独享账号 | 30美金订阅成品号",
        stock: 7,
        productUrl: "https://shop.bmoplus.com/shop/commodityDetails?id=77",
        lastFetchedAt: "2026-04-22T05:12:00.000Z",
        notifyEnabled: false,
        minNotifyStock: 0,
        maxNotifyStock: 99999,
      },
      {
        id: "b-99",
        source: "bmoplus-group-owner",
        sourceLabel: "群主店",
        externalId: "99",
        name: "群主店独有商品",
        stock: 3,
        productUrl: "https://shop.bmoplus.com/shop/commodityDetails?id=99",
        lastFetchedAt: "2026-04-22T05:12:00.000Z",
        notifyEnabled: true,
        minNotifyStock: 1,
        maxNotifyStock: 10,
      },
    ]);

    expect(result.map((item) => item.id)).toEqual(["m-1", "m-2"]);
    expect(result[0]).toMatchObject({
      name: "ChatGPT Plus 代充｜自助充值｜24小时充值",
      stock: 12,
      sourceLabel: "普货店",
      matchedOwnerShopName: "ChatGPT Plus 代充｜自助充值｜24小时充值",
      matchedOwnerShopStock: 0,
    });
    expect(result[1]).toMatchObject({
      name: "SuperGrok 独享账号 | 30美金订阅成品号",
      matchedOwnerShopName: "【质保一月】SuperGrok 独享账号 | 30美金订阅成品号",
      matchedOwnerShopStock: 7,
    });
  });
});
