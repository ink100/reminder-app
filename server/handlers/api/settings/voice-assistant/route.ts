import { z } from "zod";

import { requireAdminApi } from "@/lib/admin-api";
import { toApiErrorResponse } from "@/lib/api-error";
import { appSettingStore } from "@/lib/app-settings/store";
import { ensureVoiceAssistantSettings } from "@/lib/bootstrap-settings";
import { encryptText } from "@/lib/crypto";
import {
  DEFAULT_VOICE_ASSISTANT_BASE_URL,
  DEFAULT_VOICE_ASSISTANT_MODEL,
  DEFAULT_VOICE_ASSISTANT_SYSTEM_PROMPT,
  DEFAULT_VOICE_ASSISTANT_VOICE,
  getEditableVoiceAssistantSettings,
} from "@/lib/voice/settings";

const inputSchema = z.object({
  provider: z.literal("openai-compatible"),
  baseUrl: z.url().max(500).refine((value) => new URL(value).protocol === "https:", "Base URL 必须使用 HTTPS"),
  apiKey: z.string().max(1000).default(""),
  clearApiKey: z.boolean().default(false),
  model: z.string().trim().min(1).max(200),
  systemPrompt: z.string().trim().min(1).max(8000),
  allowMutations: z.boolean(),
  defaultVoice: z.string().trim().min(1).max(200),
});

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  if (!auth.actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ item: getEditableVoiceAssistantSettings(await ensureVoiceAssistantSettings()) });
  } catch (error) {
    return toApiErrorResponse(error, { defaultMessage: "AI 语音助手配置读取失败" });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  if (!auth.actor) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const input = inputSchema.parse(await request.json());
    await ensureVoiceAssistantSettings();
    const settings = await appSettingStore.update({
      where: { id: 1 },
      data: {
        voiceAssistantProvider: input.provider,
        voiceAssistantConfigured: true,
        voiceAssistantBaseUrl: input.baseUrl || DEFAULT_VOICE_ASSISTANT_BASE_URL,
        voiceAssistantModel: input.model || DEFAULT_VOICE_ASSISTANT_MODEL,
        voiceAssistantSystemPrompt: input.systemPrompt || DEFAULT_VOICE_ASSISTANT_SYSTEM_PROMPT,
        voiceAssistantAllowMutations: input.allowMutations,
        voiceAssistantDefaultVoice: input.defaultVoice || DEFAULT_VOICE_ASSISTANT_VOICE,
        ...(input.clearApiKey
          ? { voiceAssistantApiKeyEncrypted: null }
          : input.apiKey.trim()
            ? { voiceAssistantApiKeyEncrypted: encryptText(input.apiKey.trim()) }
            : {}),
      },
    });
    return Response.json({ item: getEditableVoiceAssistantSettings(settings) });
  } catch (error) {
    return toApiErrorResponse(error, { defaultMessage: "AI 语音助手配置无效" });
  }
}
