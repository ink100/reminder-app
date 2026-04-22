-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" DATETIME NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "category" TEXT,
    "remindBeforeDays" INTEGER NOT NULL DEFAULT 3,
    "remindBeforeHours" INTEGER NOT NULL DEFAULT 24,
    "overdueRemindEnabled" BOOLEAN NOT NULL DEFAULT true,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "appName" TEXT NOT NULL DEFAULT '到期提醒',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "defaultRemindBeforeDays" INTEGER NOT NULL DEFAULT 3,
    "defaultRemindBeforeHours" INTEGER NOT NULL DEFAULT 24,
    "overdueRepeatEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyRemindTime" TEXT NOT NULL DEFAULT '09:00',
    "otpSecretEncrypted" TEXT,
    "otpConfiguredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionTokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Reminder_dueAt_idx" ON "Reminder"("dueAt");

-- CreateIndex
CREATE INDEX "Reminder_completedAt_idx" ON "Reminder"("completedAt");

-- CreateIndex
CREATE INDEX "Reminder_deletedAt_idx" ON "Reminder"("deletedAt");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
