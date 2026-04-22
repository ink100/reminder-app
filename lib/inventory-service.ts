import { prisma } from "@/lib/prisma";
import { buildCanonicalInventoryItems, type CanonicalInventoryItem } from "@/lib/inventory-catalog";
import {
  collectInventoryNotifications,
  isInventoryInRange,
  type InventoryNotificationCandidate,
} from "@/lib/inventory-notifications";
import { parseBmoplusInventory, parseMakerichInventoryPage, type ScrapedInventoryItem } from "@/lib/inventory-sources";

const MAKERICH_URL = "https://stock.makerich.club/";
const BMOPLUS_URL = "https://shop.bmoplus.com/user/api/index/commodity?categoryId=0";

export type InventoryWatchListItem = CanonicalInventoryItem;

async function fetchWithCheck(url: string, errorPrefix: string) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`${errorPrefix}：${response.status}`);
  }

  return response;
}

export async function fetchMakerichInventorySource() {
  const response = await fetchWithCheck(MAKERICH_URL, "普货店抓取失败");
  const html = await response.text();
  return parseMakerichInventoryPage(html);
}

export async function fetchBmoplusInventorySource() {
  const response = await fetchWithCheck(BMOPLUS_URL, "群主店抓取失败");
  const payload = await response.json();
  return parseBmoplusInventory(payload);
}

export async function fetchInventorySources() {
  const [makerichItems, bmoplusItems] = await Promise.all([
    fetchMakerichInventorySource(),
    fetchBmoplusInventorySource(),
  ]);

  return [...makerichItems, ...bmoplusItems];
}

export async function upsertInventoryWatches(items: ScrapedInventoryItem[]) {
  const now = new Date();

  for (const item of items) {
    await prisma.inventoryWatch.upsert({
      where: {
        source_externalId: {
          source: item.source,
          externalId: item.externalId,
        },
      },
      update: {
        sourceLabel: item.sourceLabel,
        name: item.name,
        stock: item.stock,
        productUrl: item.productUrl,
        lastFetchedAt: now,
      },
      create: {
        source: item.source,
        sourceLabel: item.sourceLabel,
        externalId: item.externalId,
        name: item.name,
        stock: item.stock,
        productUrl: item.productUrl,
        lastFetchedAt: now,
      },
    });
  }
}

export async function syncMakerichInventoryWatches() {
  const items = await fetchMakerichInventorySource();
  await upsertInventoryWatches(items);
  return listInventoryWatches();
}

export async function syncBmoplusInventoryWatches() {
  const items = await fetchBmoplusInventorySource();
  await upsertInventoryWatches(items);
  return listInventoryWatches();
}

export async function syncInventoryWatches(items?: ScrapedInventoryItem[]) {
  const scrapedItems = items ?? (await fetchInventorySources());
  await upsertInventoryWatches(scrapedItems);
  return listInventoryWatches();
}

export async function listInventoryWatches() {
  const items = await prisma.inventoryWatch.findMany({
    orderBy: [{ sourceLabel: "asc" }, { name: "asc" }],
  });

  return buildCanonicalInventoryItems(
    items.map((item) => ({
      id: item.id,
      source: item.source,
      sourceLabel: item.sourceLabel,
      externalId: item.externalId,
      name: item.name,
      stock: item.stock,
      productUrl: item.productUrl,
      lastFetchedAt: item.lastFetchedAt?.toISOString() ?? null,
      notifyEnabled: item.notifyEnabled,
      minNotifyStock: item.minNotifyStock,
      maxNotifyStock: item.maxNotifyStock,
    })),
  );
}

export async function ensureInventoryData() {
  const primaryCount = await prisma.inventoryWatch.count({ where: { source: "makerich-general" } });

  if (primaryCount === 0) {
    return syncInventoryWatches();
  }

  return listInventoryWatches();
}

export async function updateInventoryNotificationStates() {
  const items = await listInventoryWatches();
  const candidates: InventoryNotificationCandidate[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    sourceLabel: item.sourceLabel,
    stock: item.stock,
    notifyEnabled: item.notifyEnabled,
    minNotifyStock: item.minNotifyStock,
    maxNotifyStock: item.maxNotifyStock,
    lastRangeMatched: false,
    lastNotifiedStock: null,
  }));

  const primaryRows = await prisma.inventoryWatch.findMany({ where: { source: "makerich-general" } });
  const previousStateMap = new Map(
    primaryRows.map((item) => [
      item.id,
      {
        lastRangeMatched: item.lastRangeMatched,
        lastNotifiedStock: item.lastNotifiedStock,
      },
    ]),
  );

  for (const candidate of candidates) {
    const previousState = previousStateMap.get(candidate.id);
    if (previousState) {
      candidate.lastRangeMatched = previousState.lastRangeMatched;
      candidate.lastNotifiedStock = previousState.lastNotifiedStock;
    }
  }

  const notifications = collectInventoryNotifications(candidates);
  const notifyMap = new Map(notifications.map((item) => [item.id, item.stock]));
  const now = new Date();

  await Promise.all(
    items.map((item) => {
      const inRange = item.notifyEnabled && isInventoryInRange(item);
      const nextData = notifyMap.has(item.id)
        ? {
            lastRangeMatched: inRange,
            lastNotifiedStock: notifyMap.get(item.id) ?? null,
            lastNotifiedAt: now,
          }
        : {
            lastRangeMatched: inRange,
          };

      return prisma.inventoryWatch.update({
        where: { id: item.id },
        data: nextData,
      });
    }),
  );

  return items
    .filter((item) => notifyMap.has(item.id))
    .map((item) => ({
      id: item.id,
      name: item.name,
      sourceLabel: item.sourceLabel,
      stock: notifyMap.get(item.id) ?? item.stock,
      productUrl: item.productUrl,
      minNotifyStock: item.minNotifyStock,
      maxNotifyStock: item.maxNotifyStock,
    }));
}
