type InventoryCatalogItem = {
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
};

export type CanonicalInventoryItem = InventoryCatalogItem & {
  matchedOwnerShopName: string | null;
  matchedOwnerShopStock: number | null;
  matchedOwnerShopLastFetchedAt: string | null;
  matchedOwnerShopUrl: string | null;
};

export function normalizeInventoryName(value: string) {
  return value
    .toLowerCase()
    .replace(/【[^】]*】/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "")
    .trim();
}

function isLikelySameProduct(left: string, right: string) {
  const normalizedLeft = normalizeInventoryName(left);
  const normalizedRight = normalizeInventoryName(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}

export function buildCanonicalInventoryItems(items: InventoryCatalogItem[]): CanonicalInventoryItem[] {
  const primaryItems = items.filter((item) => item.source === "makerich-general");
  const ownerItems = items.filter((item) => item.source === "bmoplus-group-owner");

  return primaryItems.map((item) => {
    const matchedOwnerItem = ownerItems.find((ownerItem) => isLikelySameProduct(item.name, ownerItem.name)) ?? null;

    return {
      ...item,
      matchedOwnerShopName: matchedOwnerItem?.name ?? null,
      matchedOwnerShopStock: matchedOwnerItem?.stock ?? null,
      matchedOwnerShopLastFetchedAt: matchedOwnerItem?.lastFetchedAt ?? null,
      matchedOwnerShopUrl: matchedOwnerItem?.productUrl ?? null,
    };
  });
}
