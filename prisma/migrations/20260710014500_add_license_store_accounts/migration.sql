-- CreateTable
CREATE TABLE "LicenseStoreAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "remoteCode" TEXT NOT NULL,
    "remotePassword" TEXT NOT NULL,
    "isOtherAccount" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" DATETIME NOT NULL,
    "activationCode" TEXT NOT NULL,
    "reminderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "LicenseStoreAccount_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "Reminder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LicenseStoreAccount_expiresAt_idx" ON "LicenseStoreAccount"("expiresAt");

-- CreateIndex
CREATE INDEX "LicenseStoreAccount_activationCode_idx" ON "LicenseStoreAccount"("activationCode");

-- CreateIndex
CREATE INDEX "LicenseStoreAccount_reminderId_idx" ON "LicenseStoreAccount"("reminderId");

-- CreateIndex
CREATE INDEX "LicenseStoreAccount_deletedAt_idx" ON "LicenseStoreAccount"("deletedAt");
