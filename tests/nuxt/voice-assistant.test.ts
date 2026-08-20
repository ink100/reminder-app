import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("voice conversion page contract", () => {
  it("keeps the standalone page focused on TTS and STT and directs AI use to the floating button", async () => {
    const source = await readFile("app/pages/voice.vue", "utf8");
    for (const contract of [
      'const mode = ref<"tts" | "stt">("tts")', "文字转语音", "语音转文字",
      "AI 助手请使用右下角语音按钮", "/api/voice/tts", "/api/voice/transcriptions",
      "credentials: \"same-origin\"", 'layout: "default"', 'middleware: "auth"', "读取文本文件失败",
    ]) expect(source).toContain(contract);
    for (const removed of [
      "/api/voice/assistant", "AI 配置", "Base URL", "API Key（不保存）", "System Prompt",
      "MCP 工具调用过程", "allowMutations", "toolCalls", "assistantInput", "发送给 AI",
    ]) expect(source).not.toContain(removed);
  });

  it("does not reuse stale audio and cleans up generated media on unmount", async () => {
    const source = await readFile("app/pages/voice.vue", "utf8");
    expect(source).toContain("audioFile.value = null");
    expect(source).toContain("disposed = true");
    expect(source).toContain("revokeAudioUrl()");
    expect(source).not.toMatch(/localStorage|sessionStorage/);
  });

  it("scopes transcription state to the newest abortable request", async () => {
    const source = await readFile("app/pages/voice.vue", "utf8");
    expect(source).toContain("transcriptionController?.abort()");
    expect(source).toContain("const generation = ++transcriptionGeneration");
    expect(source).toContain("signal: controller.signal");
    expect(source).toContain("generation !== transcriptionGeneration");
    expect(source).toContain("generation === transcriptionGeneration");
  });
});
