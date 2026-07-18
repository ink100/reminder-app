-- Remove any legacy unassigned payment QR rows and prevent future global payment QR metadata.
UPDATE "Attachment"
SET "deletedAt" = COALESCE("deletedAt", CURRENT_TIMESTAMP)
WHERE "attachmentType" IN ('wechat_payment_qr', 'alipay_payment_qr')
  AND "licenseStoreAccountId" IS NULL
  AND "deletedAt" IS NULL;

CREATE TRIGGER "Attachment_paymentQrOwner_insert"
BEFORE INSERT ON "Attachment"
WHEN NEW."attachmentType" IN ('wechat_payment_qr', 'alipay_payment_qr')
  AND NEW."licenseStoreAccountId" IS NULL
BEGIN
  SELECT RAISE(ABORT, 'payment QR attachment requires a store account');
END;

CREATE TRIGGER "Attachment_paymentQrOwner_update"
BEFORE UPDATE OF "attachmentType", "licenseStoreAccountId" ON "Attachment"
WHEN NEW."attachmentType" IN ('wechat_payment_qr', 'alipay_payment_qr')
  AND NEW."licenseStoreAccountId" IS NULL
BEGIN
  SELECT RAISE(ABORT, 'payment QR attachment requires a store account');
END;
