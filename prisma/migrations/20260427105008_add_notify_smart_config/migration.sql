-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "appName" TEXT NOT NULL DEFAULT '到期提醒',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "defaultRemindBeforeDays" INTEGER NOT NULL DEFAULT 3,
    "defaultRemindBeforeHours" INTEGER NOT NULL DEFAULT 24,
    "overdueRepeatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyRemindTime" TEXT NOT NULL DEFAULT '09:00',
    "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notificationEmail" TEXT,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPassEncrypted" TEXT,
    "smtpFromEmail" TEXT,
    "smtpFromName" TEXT,
    "otpSecretEncrypted" TEXT,
    "otpConfiguredAt" DATETIME,
    "inventorySyncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inventoryGeneralInterval" INTEGER NOT NULL DEFAULT 60,
    "inventoryOwnerInterval" INTEGER NOT NULL DEFAULT 180,
    "inventoryCheckEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inventoryCheckInterval" INTEGER NOT NULL DEFAULT 60,
    "reminderEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderEmailInterval" INTEGER NOT NULL DEFAULT 1800,
    "notifyStartHour" INTEGER NOT NULL DEFAULT 9,
    "notifyEndHour" INTEGER NOT NULL DEFAULT 22,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSetting" ("appName", "createdAt", "dailyRemindTime", "defaultRemindBeforeDays", "defaultRemindBeforeHours", "emailNotificationsEnabled", "id", "inventoryCheckEnabled", "inventoryCheckInterval", "inventoryGeneralInterval", "inventoryOwnerInterval", "inventorySyncEnabled", "notificationEmail", "otpConfiguredAt", "otpSecretEncrypted", "overdueRepeatEnabled", "reminderEmailEnabled", "reminderEmailInterval", "smtpFromEmail", "smtpFromName", "smtpHost", "smtpPassEncrypted", "smtpPort", "smtpUser", "timezone", "updatedAt") SELECT "appName", "createdAt", "dailyRemindTime", "defaultRemindBeforeDays", "defaultRemindBeforeHours", "emailNotificationsEnabled", "id", "inventoryCheckEnabled", "inventoryCheckInterval", "inventoryGeneralInterval", "inventoryOwnerInterval", "inventorySyncEnabled", "notificationEmail", "otpConfiguredAt", "otpSecretEncrypted", "overdueRepeatEnabled", "reminderEmailEnabled", "reminderEmailInterval", "smtpFromEmail", "smtpFromName", "smtpHost", "smtpPassEncrypted", "smtpPort", "smtpUser", "timezone", "updatedAt" FROM "AppSetting";
DROP TABLE "AppSetting";
ALTER TABLE "new_AppSetting" RENAME TO "AppSetting";
CREATE TABLE "new_InventoryWatch" (
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
    "notifyCooldownMin" INTEGER NOT NULL DEFAULT 120,
    "changePercent" INTEGER NOT NULL DEFAULT 5,
    "changePercentAuto" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_InventoryWatch" ("createdAt", "externalId", "id", "lastFetchedAt", "lastNotifiedAt", "lastNotifiedStock", "lastRangeMatched", "maxNotifyStock", "minNotifyStock", "name", "notifyEnabled", "productUrl", "source", "sourceLabel", "stock", "updatedAt") SELECT "createdAt", "externalId", "id", "lastFetchedAt", "lastNotifiedAt", "lastNotifiedStock", "lastRangeMatched", "maxNotifyStock", "minNotifyStock", "name", "notifyEnabled", "productUrl", "source", "sourceLabel", "stock", "updatedAt" FROM "InventoryWatch";
DROP TABLE "InventoryWatch";
ALTER TABLE "new_InventoryWatch" RENAME TO "InventoryWatch";
CREATE INDEX "InventoryWatch_source_idx" ON "InventoryWatch"("source");
CREATE INDEX "InventoryWatch_notifyEnabled_idx" ON "InventoryWatch"("notifyEnabled");
CREATE UNIQUE INDEX "InventoryWatch_source_externalId_key" ON "InventoryWatch"("source", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
