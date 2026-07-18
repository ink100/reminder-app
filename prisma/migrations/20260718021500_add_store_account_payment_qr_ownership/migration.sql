-- Add business attachment metadata used by the Supabase-backed runtime and bind payment QR screenshots to one store-account record.
ALTER TABLE "Attachment" ADD COLUMN "attachmentType" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "medicineId" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "licenseStoreAccountId" TEXT;

CREATE INDEX "Attachment_attachmentType_idx" ON "Attachment"("attachmentType");
CREATE INDEX "Attachment_medicineId_idx" ON "Attachment"("medicineId");
CREATE INDEX "Attachment_licenseStoreAccountId_idx" ON "Attachment"("licenseStoreAccountId");
