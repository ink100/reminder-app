export type CanonicalInventoryItem = {
  id: string;
  source: string;
  sourceLabel: string;
  externalId: string;
  name: string;
  stock: number;
  productUrl: string | null;
  lastFetchedAt: string | null;
  notifyEnabled: boolean;
  minNotifyStock: number;
  maxNotifyStock: number;
  notifyCooldownMin: number;
  changePercent: number;
  changePercentAuto: boolean;
};

const REMOVED_SOURCES = new Set(["makerich-general"]);

export function buildCanonicalInventoryItems(
  items: CanonicalInventoryItem[],
): CanonicalInventoryItem[] {
  // 已停用的历史库存源不再展示或参与通知。
  return items.filter((item) => !REMOVED_SOURCES.has(item.source));
}
