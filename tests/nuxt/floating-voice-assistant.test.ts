import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("global floating voice assistant contract", () => {
  it("mounts a global assistant outside the side and mobile navigation", async () => {
    const shell = await readFile("app/components/layout/AppShell.vue", "utf8");
    expect(shell).toContain("<FloatingVoiceAssistant />");
  });

  it("provides an accessible fixed microphone launcher and responsive panel", async () => {
    const source = await readFile("app/components/voice/FloatingVoiceAssistant.vue", "utf8");
    expect(source).toContain('aria-label="打开 AI 语音助手"');
    expect(source).toContain("position: fixed");
    expect(source).toContain("env(safe-area-inset-bottom)");
    expect(source).toContain("AI 语音助手");
    expect(source).toContain("role=\"dialog\"");
    expect(source).toContain("calc(100dvh - 158px - env(safe-area-inset-bottom))");
  });

  it("keeps configuration in the configuration center and exposes only voice interaction plus conversation text", async () => {
    const source = await readFile("app/components/voice/FloatingVoiceAssistant.vue", "utf8");
    for (const contract of [
      "MediaRecorder", "getUserMedia", "/api/voice/transcriptions", "/api/voice/assistant",
      "确认 AI 修改权限", "transcriptionController", "recorder.ondataavailable=null",
      "generation !== recordingGeneration", "speechController?.abort()", "generation !== speechGeneration",
      "speechAudio === audio", "speechAudio.onended = null", "speechAudio.onerror = null",
      "beginLongPress", "@pointerdown", "@pointercancel", "void startRecording()",
      "正在聆听", "语音识别文本", "按住说话", "播放回复", "检查中…",
      "recordingRequested", "endLongPress", "pendingTranscript", "buildVoiceAssistantRequestMessages",
    ]) expect(source).toContain(contract);
    for (const forbidden of [
      "settings-collapse", "AI 配置", "Base URL", "API Key", "System Prompt",
      "tool-traces", "MCP 工具调用过程", "输入消息，或点击麦克风说话", ">发送</ElButton>",
    ]) expect(source).not.toContain(forbidden);
    expect(source).toContain("if (open.value) closePanel()");
    expect(source).toContain("const pendingLongPress = longPressTimer !== null");
    expect(source).toContain("if (pendingLongPress) longPressTriggered = true");
    expect(source).not.toMatch(/localStorage|sessionStorage/);
    expect(source).not.toContain("messages.value = requestMessages");
    expect(source).toContain("generation !== recordingGeneration || !recordingRequested");
  });

  it("places provider, model, MCP permission and default voice settings in configuration center", async () => {
    const page = await readFile("app/pages/settings.vue", "utf8");
    const card = await readFile("app/components/settings/VoiceAssistantSettingsCard.vue", "utf8");
    expect(page).toContain("<VoiceAssistantSettingsCard/>");
    for (const contract of [
      "/api/settings/voice-assistant", "AI Provider", "API Key", "Base URL", "模型",
      "System Prompt", "MCP 权限", "默认语音", "apiKeyConfigured",
    ]) expect(card).toContain(contract);
    expect(card).not.toMatch(/localStorage|sessionStorage/);
  });
});
