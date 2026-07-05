-- CreateTable
CREATE TABLE "NotificationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT,
    "groupId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'Created',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "NotificationEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Notification_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "NotificationGroup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QueueJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "notificationId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetry" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "nextExecuteAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QueueJob_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QueueJob_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QueueJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "NotificationTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" TEXT NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "NotificationGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "NotificationApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" DATETIME
);

-- CreateTable
CREATE TABLE "SendLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "queueJobId" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SendLog_queueJobId_fkey" FOREIGN KEY ("queueJobId") REFERENCES "QueueJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "NotificationEvent_createdAt_idx" ON "NotificationEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE INDEX "Notification_groupId_idx" ON "Notification"("groupId");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "QueueJob_status_idx" ON "QueueJob"("status");

-- CreateIndex
CREATE INDEX "QueueJob_nextExecuteAt_idx" ON "QueueJob"("nextExecuteAt");

-- CreateIndex
CREATE INDEX "QueueJob_notificationId_idx" ON "QueueJob"("notificationId");

-- CreateIndex
CREATE INDEX "NotificationChannel_type_idx" ON "NotificationChannel"("type");

-- CreateIndex
CREATE INDEX "NotificationChannel_enabled_idx" ON "NotificationChannel"("enabled");

-- CreateIndex
CREATE INDEX "NotificationTemplate_channelType_idx" ON "NotificationTemplate"("channelType");

-- CreateIndex
CREATE INDEX "NotificationTemplate_enabled_idx" ON "NotificationTemplate"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationGroup_name_key" ON "NotificationGroup"("name");

-- CreateIndex
CREATE INDEX "NotificationGroup_enabled_idx" ON "NotificationGroup"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationApiKey_apiKey_key" ON "NotificationApiKey"("apiKey");

-- CreateIndex
CREATE INDEX "NotificationApiKey_apiKey_idx" ON "NotificationApiKey"("apiKey");

-- CreateIndex
CREATE INDEX "NotificationApiKey_enabled_idx" ON "NotificationApiKey"("enabled");

-- CreateIndex
CREATE INDEX "SendLog_queueJobId_idx" ON "SendLog"("queueJobId");

-- CreateIndex
CREATE INDEX "SendLog_createdAt_idx" ON "SendLog"("createdAt");

