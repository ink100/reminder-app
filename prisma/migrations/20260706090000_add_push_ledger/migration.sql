-- CreateTable
CREATE TABLE "PushLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "notificationId" TEXT,
    "queueJobId" TEXT,
    "channelId" TEXT,
    "channelType" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "target" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "rawPayload" TEXT NOT NULL DEFAULT '{}',
    "businessType" TEXT,
    "businessId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "request" TEXT,
    "response" TEXT,
    "error" TEXT,
    "durationMs" INTEGER,
    "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "sentAt" DATETIME,
    "failedAt" DATETIME,
    "lastRetryAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushLedger_queueJobId_fkey" FOREIGN KEY ("queueJobId") REFERENCES "QueueJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PushLedger_queueJobId_key" ON "PushLedger"("queueJobId");
CREATE INDEX "PushLedger_createdAt_idx" ON "PushLedger"("createdAt");
CREATE INDEX "PushLedger_status_idx" ON "PushLedger"("status");
CREATE INDEX "PushLedger_channelType_idx" ON "PushLedger"("channelType");
CREATE INDEX "PushLedger_businessId_idx" ON "PushLedger"("businessId");
CREATE INDEX "PushLedger_notificationId_idx" ON "PushLedger"("notificationId");
