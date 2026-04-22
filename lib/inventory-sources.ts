export type InventorySourceKey = "makerich-general" | "bmoplus-group-owner";

export type ScrapedInventoryItem = {
  externalId: string;
  source: InventorySourceKey;
  sourceLabel: string;
  name: string;
  stock: number;
  productUrl: string | null;
};

type BmoplusPayload = {
  data?: Array<{
    id?: number | string;
    name?: string;
    stock?: number;
    hide?: number;
    status?: number;
  }>;
};

function decodeHtml(value: string) {
  return value
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function parseMakerichInventoryPage(html: string): ScrapedInventoryItem[] {
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)];
  const items = rows
    .map((match) => match[1])
    .filter((row) => row.includes("/product/"))
    .map((row): ScrapedInventoryItem | null => {
      const productMatch = row.match(/href="\/product\/(\d+)"[^>]*>([\s\S]*?)<\/a>/i);
      const stockMatch = row.match(/<span class="pill[^\"]*">\s*(\d+)\s*<\/span>/i);
      const sourceUrlMatch = row.match(/href="(https:\/\/makerich\.club\/item\?id=\d+)"/i);

      if (!productMatch || !stockMatch) {
        return null;
      }

      return {
        externalId: productMatch[1],
        source: "makerich-general",
        sourceLabel: "普货店",
        name: decodeHtml(productMatch[2]),
        stock: Number(stockMatch[1]),
        productUrl: sourceUrlMatch?.[1] ?? null,
      };
    });

  return items.filter((item): item is ScrapedInventoryItem => item !== null);
}

export function parseBmoplusInventory(payload: BmoplusPayload): ScrapedInventoryItem[] {
  return (payload.data ?? [])
    .filter((item) => item.hide !== 1 && item.status !== 0 && item.id !== undefined && item.name)
    .map((item) => ({
      externalId: String(item.id),
      source: "bmoplus-group-owner" as const,
      sourceLabel: "群主店",
      name: item.name!.trim(),
      stock: Number(item.stock ?? 0),
      productUrl: `https://shop.bmoplus.com/shop/commodityDetails?id=${item.id}`,
    }));
}
