import { appSettingStore } from "@/lib/app-settings/store";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const LEGACY_ADMIN_ID = "legacy-admin";

/** Idempotent bootstrap. Ciphertext is copied without decrypting or logging it. */
export async function ensureLegacyAdmin() {
  const settings = await appSettingStore.findUnique({ where: { id: 1 } });
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { id: LEGACY_ADMIN_ID },
      update: {
        username: env.LEGACY_ADMIN_USERNAME.toLowerCase(),
        displayName: env.LEGACY_ADMIN_DISPLAY_NAME,
      },
      create: {
        id: LEGACY_ADMIN_ID,
        username: env.LEGACY_ADMIN_USERNAME.toLowerCase(),
        displayName: env.LEGACY_ADMIN_DISPLAY_NAME,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    if (settings?.otpSecretEncrypted) {
      await tx.userTotpFactor.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, secretEncrypted: settings.otpSecretEncrypted },
      });
    }
    return user;
  });
}
