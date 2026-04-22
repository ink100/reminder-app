-- AlterTable
ALTER TABLE "AppSetting" ADD COLUMN "smtpFromEmail" TEXT;
ALTER TABLE "AppSetting" ADD COLUMN "smtpFromName" TEXT;
ALTER TABLE "AppSetting" ADD COLUMN "smtpHost" TEXT;
ALTER TABLE "AppSetting" ADD COLUMN "smtpPassEncrypted" TEXT;
ALTER TABLE "AppSetting" ADD COLUMN "smtpPort" INTEGER;
ALTER TABLE "AppSetting" ADD COLUMN "smtpUser" TEXT;
