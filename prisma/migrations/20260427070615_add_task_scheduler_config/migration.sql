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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSetting" ("appName", "createdAt", "dailyRemindTime", "defaultRemindBeforeDays", "defaultRemindBeforeHours", "emailNotificationsEnabled", "id", "notificationEmail", "otpConfiguredAt", "otpSecretEncrypted", "overdueRepeatEnabled", "smtpFromEmail", "smtpFromName", "smtpHost", "smtpPassEncrypted", "smtpPort", "smtpUser", "timezone", "updatedAt") SELECT "appName", "createdAt", "dailyRemindTime", "defaultRemindBeforeDays", "defaultRemindBeforeHours", "emailNotificationsEnabled", "id", "notificationEmail", "otpConfiguredAt", "otpSecretEncrypted", "overdueRepeatEnabled", "smtpFromEmail", "smtpFromName", "smtpHost", "smtpPassEncrypted", "smtpPort", "smtpUser", "timezone", "updatedAt" FROM "AppSetting";
DROP TABLE "AppSetting";
ALTER TABLE "new_AppSetting" RENAME TO "AppSetting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
