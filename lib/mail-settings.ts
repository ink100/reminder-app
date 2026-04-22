import { env } from "@/lib/env";
import { decryptText } from "@/lib/crypto";

export type MailConfigSource = {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPassEncrypted: string | null;
  smtpFromEmail: string | null;
  smtpFromName: string | null;
};

export type EditableMailSettingsSource = MailConfigSource & {
  appName: string;
  timezone: string;
  emailNotificationsEnabled: boolean;
  notificationEmail: string | null;
};

export type ResolvedMailConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string | null;
};

export function resolveMailConfig(source: MailConfigSource): ResolvedMailConfig | null {
  if (
    !source.smtpHost ||
    !source.smtpPort ||
    !source.smtpUser ||
    !source.smtpPassEncrypted ||
    !source.smtpFromEmail
  ) {
    return null;
  }

  return {
    host: source.smtpHost,
    port: source.smtpPort,
    user: source.smtpUser,
    pass: decryptText(source.smtpPassEncrypted),
    fromEmail: source.smtpFromEmail,
    fromName: source.smtpFromName,
  };
}

export function resolveMailConfigWithEnvFallback(source?: Partial<MailConfigSource> | null): ResolvedMailConfig | null {
  const fromSettings = source
    ? resolveMailConfig({
        smtpHost: source.smtpHost ?? null,
        smtpPort: source.smtpPort ?? null,
        smtpUser: source.smtpUser ?? null,
        smtpPassEncrypted: source.smtpPassEncrypted ?? null,
        smtpFromEmail: source.smtpFromEmail ?? null,
        smtpFromName: source.smtpFromName ?? null,
      })
    : null;

  if (fromSettings) {
    return fromSettings;
  }

  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM_EMAIL) {
    return null;
  }

  return {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    fromEmail: env.SMTP_FROM_EMAIL,
    fromName: env.SMTP_FROM_NAME ?? null,
  };
}

export function getEditableMailSettings(source: EditableMailSettingsSource) {
  return {
    appName: source.appName,
    timezone: source.timezone,
    emailNotificationsEnabled: source.emailNotificationsEnabled,
    notificationEmail: source.notificationEmail ?? "",
    smtpHost: source.smtpHost ?? "",
    smtpPort: source.smtpPort ?? 587,
    smtpUser: source.smtpUser ?? "",
    smtpFromEmail: source.smtpFromEmail ?? "",
    smtpFromName: source.smtpFromName ?? "",
    smtpPasswordConfigured: Boolean(source.smtpPassEncrypted),
  };
}
