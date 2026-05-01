export type ScrapedInventoryItem = {
  externalId: string;
  source: string;
  sourceLabel: string;
  name: string;
  stock: number;
  productUrl: string | null;
};
