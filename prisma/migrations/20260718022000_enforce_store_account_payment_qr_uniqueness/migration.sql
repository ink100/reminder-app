-- Enforce one active WeChat or Alipay QR screenshot per local store-account record.
CREATE UNIQUE INDEX "Attachment_activeStoreAccountPaymentQr_key"
ON "Attachment"("licenseStoreAccountId", "attachmentType")
WHERE "licenseStoreAccountId" IS NOT NULL
  AND "attachmentType" IN ('wechat_payment_qr', 'alipay_payment_qr')
  AND "deletedAt" IS NULL;
