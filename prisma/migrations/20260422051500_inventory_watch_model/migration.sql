CREATE TABLE "InventoryWatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "source" TEXT NOT NULL,
  "sourceLabel" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "stock" INTEGER NOT NULL DEFAULT 0,
  "productUrl" TEXT,
  "lastFetchedAt" DATETIME,
  "notifyEnabled" BOOLEAN NOT NULL DEFAULT false,
  "minNotifyStock" INTEGER NOT NULL DEFAULT 0,
  "maxNotifyStock" INTEGER NOT NULL DEFAULT 99999,
  "lastRangeMatched" BOOLEAN NOT NULL DEFAULT false,
  "lastNotifiedStock" INTEGER,
  "lastNotifiedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "InventoryWatch_source_externalId_key" ON "InventoryWatch"("source", "externalId");
CREATE INDEX "InventoryWatch_source_idx" ON "InventoryWatch"("source");
CREATE INDEX "InventoryWatch_notifyEnabled_idx" ON "InventoryWatch"("notifyEnabled");
