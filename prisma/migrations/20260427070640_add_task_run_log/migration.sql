-- CreateTable
CREATE TABLE "TaskRunLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "task" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    "success" BOOLEAN NOT NULL,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "TaskRunLog_startedAt_idx" ON "TaskRunLog"("startedAt");
