import { describe, expect, it } from "vitest";

import { parseBmoplusInventory, parseMakerichInventoryPage } from "@/lib/inventory-sources";

describe("inventory source parsers", () => {
  it("parses makerich inventory html into normalized products", () => {
    const items = parseMakerichInventoryPage(`
      <table>
        <tbody>
          <tr>
            <td><a href="/product/1">ChatGPT Plus 代充</a></td>
            <td><span class="pill stock0">0</span></td>
            <td><canvas class="spark" id="spark-1"></canvas></td>
            <td class="muted">2026-04-22 13:05:00</td>
            <td><a href="https://makerich.club/item?id=120">打开</a></td>
          </tr>
          <tr>
            <td><a href="/product/7">Grok AI 账号</a></td>
            <td><span class="pill stockok">53</span></td>
            <td><canvas class="spark" id="spark-7"></canvas></td>
            <td class="muted">2026-04-22 13:05:00</td>
            <td><a href="https://makerich.club/item?id=131">打开</a></td>
          </tr>
        </tbody>
      </table>
    `);

    expect(items).toEqual([
      {
        externalId: "1",
        source: "makerich-general",
        sourceLabel: "普货店",
        name: "ChatGPT Plus 代充",
        stock: 0,
        productUrl: "https://makerich.club/item?id=120",
      },
      {
        externalId: "7",
        source: "makerich-general",
        sourceLabel: "普货店",
        name: "Grok AI 账号",
        stock: 53,
        productUrl: "https://makerich.club/item?id=131",
      },
    ]);
  });

  it("parses bmoplus api payload and filters visible products", () => {
    const items = parseBmoplusInventory({
      code: 200,
      msg: "success",
      data: [
        {
          id: 10,
          name: "ChatGPT Plus独享账号 全功能独享",
          stock: 10,
          hide: 0,
          status: 1,
        },
        {
          id: 26,
          name: "ChatGPT Plus 代充｜自助充值｜24小时充值",
          stock: 0,
          hide: 0,
          status: 1,
        },
        {
          id: 99,
          name: "已隐藏商品",
          stock: 999,
          hide: 1,
          status: 1,
        },
      ],
    });

    expect(items).toEqual([
      {
        externalId: "10",
        source: "bmoplus-group-owner",
        sourceLabel: "群主店",
        name: "ChatGPT Plus独享账号 全功能独享",
        stock: 10,
        productUrl: "https://shop.bmoplus.com/shop/commodityDetails?id=10",
      },
      {
        externalId: "26",
        source: "bmoplus-group-owner",
        sourceLabel: "群主店",
        name: "ChatGPT Plus 代充｜自助充值｜24小时充值",
        stock: 0,
        productUrl: "https://shop.bmoplus.com/shop/commodityDetails?id=26",
      },
    ]);
  });
});
