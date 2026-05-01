import { prisma } from "@/lib/prisma";
import { buildCanonicalInventoryItems, type CanonicalInventoryItem } from "@/lib/inventory-catalog";
import {
  collectInventoryNotifications,
  adaptChangePercent,
  isInventoryInRange,
  type InventoryNotificationCandidate,
  type InventoryNotificationContext,
} from "@/lib/inventory-notifications";
import type { ScrapedInventoryItem } from "@/lib/inventory-sources";

export type InventoryWatchListItem = CanonicalInventoryItem;

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

export async function syncInventoryWatches(items: ScrapedInventoryItem[] = []) {
  if (items.length > 0) {
    await upsertInventoryWatches(items);
  }
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
      notifyCooldownMin: item.notifyCooldownMin,
      changePercent: item.changePercent,
      changePercentAuto: item.changePercentAuto,
    })),
  );
}

export async function ensureInventoryData() {
  return listInventoryWatches();
}

export async function updateInventoryNotificationStates() {
  const settings = await prisma.appSetting.findUnique({ where: { id: 1 } });
  const ctx: InventoryNotificationContext = {
    now: new Date(),
    notifyStartHour: settings?.notifyStartHour ?? 9,
    notifyEndHour: settings?.notifyEndHour ?? 22,
  };

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
    lastNotifiedAt: null,
    notifyCooldownMin: item.notifyCooldownMin,
    changePercent: item.changePercent,
    changePercentAuto: item.changePercentAuto,
  }));

  const currentRows = await prisma.inventoryWatch.findMany({ where: { id: { in: items.map((item) => item.id) } } });
  const previousStateMap = new Map(
    currentRows.map((item) => [
      item.id,
      {
        lastRangeMatched: item.lastRangeMatched,
        lastNotifiedStock: item.lastNotifiedStock,
        lastNotifiedAt: item.lastNotifiedAt?.toISOString() ?? null,
        changePercent: item.changePercent,
      },
    ]),
  );

  for (const candidate of candidates) {
    const previousState = previousStateMap.get(candidate.id);
    if (previousState) {
      candidate.lastRangeMatched = previousState.lastRangeMatched;
      candidate.lastNotifiedStock = previousState.lastNotifiedStock;
      candidate.lastNotifiedAt = previousState.lastNotifiedAt;
      candidate.changePercent = previousState.changePercent;
    }
  }

  const notifications = collectInventoryNotifications(candidates, ctx);
  const notifyMap = new Map(notifications.map((item) => [item.id, item.stock]));
  const now = new Date();

  await Promise.all(
    items.map((item) => {
      const inRange = item.notifyEnabled && isInventoryInRange(item);
      const inNotifyList = notifyMap.has(item.id);
      const prev = previousStateMap.get(item.id);

      const updateData: Record<string, unknown> = {
        lastRangeMatched: inRange,
      };

      if (inNotifyList) {
        const newChangePercent = adaptChangePercent(
          prev?.changePercent ?? item.changePercent,
          item.changePercentAuto,
          item.stock,
          prev?.lastNotifiedStock ?? null,
          5,
        );

        updateData.lastRangeMatched = inRange;
        updateData.lastNotifiedStock = notifyMap.get(item.id);
        updateData.lastNotifiedAt = now;
        updateData.changePercent = newChangePercent;
      }

      return prisma.inventoryWatch.update({
        where: { id: item.id },
        data: updateData,
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
