import { APP_SETTINGS_MIGRATION_VERSION, VOICE_ASSISTANT_SETTINGS_MIGRATION_VERSION } from "@/lib/app-settings/migration-version";
import { appSettingStore } from "@/lib/app-settings/store";
import { eq, selectOne } from "@/lib/notification-center/store";

export async function ensureAppSettings() {
  const marker = await selectOne<{ version: string }>("app_migrations", {
    select: "version",
    filters: { version: eq(APP_SETTINGS_MIGRATION_VERSION) },
  });
  if (!marker) throw new Error("AppSetting Supabase migration is not complete; refusing to bootstrap defaults");

  return appSettingStore.upsert({
    where: { id: 1 }, update: {},
    create: {
      id: 1, appName: "到期提醒", timezone: "Asia/Shanghai",
      defaultRemindBeforeDays: 3, defaultRemindBeforeHours: 24,
      overdueRepeatEnabled: true, dailyRemindTime: "09:00",
      emailNotificationsEnabled: false, notificationEmail: null,
      smtpHost: null, smtpPort: null, smtpUser: null, smtpPassEncrypted: null,
      smtpFromEmail: null, smtpFromName: null,
      voiceAssistantProvider: "openai-compatible",
      voiceAssistantConfigured: false,
      voiceAssistantBaseUrl: "https://api.openai.com/v1",
      voiceAssistantApiKeyEncrypted: null,
      voiceAssistantModel: "gpt-4o-mini",
      voiceAssistantSystemPrompt: "你是提醒事项语音助手。需要时使用工具，并简洁地用中文回复。",
      voiceAssistantAllowMutations: false,
      voiceAssistantDefaultVoice: "zh-CN-XiaoxiaoNeural",
    },
  });
}

export async function ensureVoiceAssistantSettings() {
  const marker = await selectOne<{ version: string }>("app_migrations", {
    select: "version",
    filters: { version: eq(VOICE_ASSISTANT_SETTINGS_MIGRATION_VERSION) },
  });
  if (!marker) throw new Error("AI voice assistant settings migration is not complete");
  return ensureAppSettings();
}
