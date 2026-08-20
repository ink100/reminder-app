import { afterEach, describe, expect, it } from "vitest";

import { getEditableVoiceAssistantSettings, resolveVoiceAssistantRuntimeConfig } from "@/lib/voice/settings";

const originalEnv = { ...process.env };
const baseSettings = {
  voiceAssistantProvider: "openai-compatible",
  voiceAssistantConfigured: false,
  voiceAssistantBaseUrl: "https://api.openai.com/v1",
  voiceAssistantApiKeyEncrypted: null,
  voiceAssistantModel: "gpt-4o-mini",
  voiceAssistantSystemPrompt: "system",
  voiceAssistantAllowMutations: false,
  voiceAssistantDefaultVoice: "zh-CN-XiaoxiaoNeural",
};

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("voice assistant settings precedence", () => {
  it("preserves custom environment endpoint/model until an administrator explicitly saves database settings", () => {
    process.env.OPENAI_API_KEY = "custom-provider-key";
    process.env.OPENAI_BASE_URL = "https://custom-provider.example/v1";
    process.env.OPENAI_MODEL = "custom-model";
    const runtime = resolveVoiceAssistantRuntimeConfig(baseSettings);
    expect(runtime).toMatchObject({
      apiKey: "custom-provider-key",
      baseUrl: "https://custom-provider.example/v1",
      model: "custom-model",
    });
    expect(getEditableVoiceAssistantSettings(baseSettings)).toMatchObject({
      baseUrl: "https://custom-provider.example/v1",
      model: "custom-model",
    });
  });

  it("uses database endpoint/model only after configuration center explicitly saves them", () => {
    process.env.OPENAI_BASE_URL = "https://environment.example/v1";
    process.env.OPENAI_MODEL = "environment-model";
    const settings = {
      ...baseSettings,
      voiceAssistantConfigured: true,
      voiceAssistantBaseUrl: "https://database.example/v1",
      voiceAssistantModel: "database-model",
    };
    expect(resolveVoiceAssistantRuntimeConfig(settings)).toMatchObject({
      baseUrl: "https://database.example/v1",
      model: "database-model",
    });
  });
});
