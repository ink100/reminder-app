export type InventoryNotificationCandidate = {
  id: string;
  name: string;
  sourceLabel: string;
  stock: number;
  notifyEnabled: boolean;
  minNotifyStock: number;
  maxNotifyStock: number;
  lastRangeMatched: boolean;
  lastNotifiedStock: number | null;
};

export function isInventoryInRange(item: Pick<InventoryNotificationCandidate, "stock" | "minNotifyStock" | "maxNotifyStock">) {
  return item.stock >= item.minNotifyStock && item.stock <= item.maxNotifyStock;
}

export function collectInventoryNotifications(items: InventoryNotificationCandidate[]) {
  return items
    .filter((item) => {
      if (!item.notifyEnabled) {
        return false;
      }

      const inRange = isInventoryInRange(item);
      if (!inRange) {
        return false;
      }

      return !item.lastRangeMatched || item.lastNotifiedStock !== item.stock;
    })
    .map((item) => ({ id: item.id, stock: item.stock }));
}
