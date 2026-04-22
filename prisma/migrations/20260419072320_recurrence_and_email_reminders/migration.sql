-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN "overdueNotifiedAt" DATETIME;
ALTER TABLE "Reminder" ADD COLUMN "recurrenceInterval" INTEGER;
ALTER TABLE "Reminder" ADD COLUMN "recurrenceType" TEXT;
ALTER TABLE "Reminder" ADD COLUMN "upcomingNotifiedAt" DATETIME;

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
    "otpSecretEncrypted" TEXT,
    "otpConfiguredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSetting" ("appName", "createdAt", "dailyRemindTime", "defaultRemindBeforeDays", "defaultRemindBeforeHours", "id", "otpConfiguredAt", "otpSecretEncrypted", "overdueRepeatEnabled", "timezone", "updatedAt") SELECT "appName", "createdAt", "dailyRemindTime", "defaultRemindBeforeDays", "defaultRemindBeforeHours", "id", "otpConfiguredAt", "otpSecretEncrypted", "overdueRepeatEnabled", "timezone", "updatedAt" FROM "AppSetting";
DROP TABLE "AppSetting";
ALTER TABLE "new_AppSetting" RENAME TO "AppSetting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
