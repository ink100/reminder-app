import type { AppSetting } from "@prisma/client";

import { ensureVoiceAssistantSettings } from "@/lib/bootstrap-settings";
import { decryptText } from "@/lib/crypto";

export const DEFAULT_VOICE_ASSISTANT_SYSTEM_PROMPT = "你是提醒事项语音助手。需要时使用工具，并简洁地用中文回复。";
export const DEFAULT_VOICE_ASSISTANT_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_VOICE_ASSISTANT_MODEL = "gpt-4o-mini";
export const DEFAULT_VOICE_ASSISTANT_VOICE = "zh-CN-XiaoxiaoNeural";

export type VoiceAssistantRuntimeConfig = {
  provider: "openai-compatible";
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  allowMutations: boolean;
  defaultVoice: string;
};

type VoiceAssistantSettingFields = Pick<AppSetting,
  | "voiceAssistantProvider"
  | "voiceAssistantConfigured"
  | "voiceAssistantBaseUrl"
  | "voiceAssistantApiKeyEncrypted"
  | "voiceAssistantModel"
  | "voiceAssistantSystemPrompt"
  | "voiceAssistantAllowMutations"
  | "voiceAssistantDefaultVoice"
>;

export function getEditableVoiceAssistantSettings(settings: VoiceAssistantSettingFields) {
  const configured = settings.voiceAssistantConfigured;
  return {
    provider: settings.voiceAssistantProvider || "openai-compatible",
    baseUrl: configured
      ? settings.voiceAssistantBaseUrl || DEFAULT_VOICE_ASSISTANT_BASE_URL
      : process.env.VOICE_ASSISTANT_BASE_URL || process.env.OPENAI_BASE_URL || settings.voiceAssistantBaseUrl || DEFAULT_VOICE_ASSISTANT_BASE_URL,
    model: configured
      ? settings.voiceAssistantModel || DEFAULT_VOICE_ASSISTANT_MODEL
      : process.env.VOICE_ASSISTANT_MODEL || process.env.OPENAI_MODEL || settings.voiceAssistantModel || DEFAULT_VOICE_ASSISTANT_MODEL,
    systemPrompt: settings.voiceAssistantSystemPrompt || DEFAULT_VOICE_ASSISTANT_SYSTEM_PROMPT,
    allowMutations: settings.voiceAssistantAllowMutations,
    defaultVoice: settings.voiceAssistantDefaultVoice || DEFAULT_VOICE_ASSISTANT_VOICE,
    apiKeyConfigured: Boolean(settings.voiceAssistantApiKeyEncrypted || process.env.OPENAI_API_KEY),
  };
}

export function resolveVoiceAssistantRuntimeConfig(settings: VoiceAssistantSettingFields): VoiceAssistantRuntimeConfig {
  let apiKey = process.env.OPENAI_API_KEY?.trim() || "";
  if (settings.voiceAssistantApiKeyEncrypted) apiKey = decryptText(settings.voiceAssistantApiKeyEncrypted);
  const configured = settings.voiceAssistantConfigured;
  return {
    provider: "openai-compatible",
    baseUrl: configured
      ? settings.voiceAssistantBaseUrl?.trim() || DEFAULT_VOICE_ASSISTANT_BASE_URL
      : process.env.VOICE_ASSISTANT_BASE_URL || process.env.OPENAI_BASE_URL || settings.voiceAssistantBaseUrl?.trim() || DEFAULT_VOICE_ASSISTANT_BASE_URL,
    apiKey,
    model: configured
      ? settings.voiceAssistantModel?.trim() || DEFAULT_VOICE_ASSISTANT_MODEL
      : process.env.VOICE_ASSISTANT_MODEL || process.env.OPENAI_MODEL || settings.voiceAssistantModel?.trim() || DEFAULT_VOICE_ASSISTANT_MODEL,
    systemPrompt: settings.voiceAssistantSystemPrompt || DEFAULT_VOICE_ASSISTANT_SYSTEM_PROMPT,
    allowMutations: settings.voiceAssistantAllowMutations,
    defaultVoice: settings.voiceAssistantDefaultVoice || DEFAULT_VOICE_ASSISTANT_VOICE,
  };
}

export async function getVoiceAssistantRuntimeConfig() {
  return resolveVoiceAssistantRuntimeConfig(await ensureVoiceAssistantSettings());
}
