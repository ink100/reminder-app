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

  it("supports microphone transcription, MCP assistant calls and safe mutation confirmation", async () => {
    const source = await readFile("app/components/voice/FloatingVoiceAssistant.vue", "utf8");
    for (const contract of [
      "MediaRecorder", "getUserMedia", "/api/voice/transcriptions", "/api/voice/assistant",
      "allowMutations", "确认 AI 修改权限", "transcriptionController", "recorder.ondataavailable=null",
      "generation !== recordingGeneration", "speechController?.abort()", "generation !== speechGeneration",
      "speechAudio === audio", "speechAudio.onended = null", "speechAudio.onerror = null",
      "beginLongPress", "@pointerdown", "@pointercancel", "void startRecording()",
    ]) expect(source).toContain(contract);
    expect(source).toContain("if (open.value) closePanel()");
    expect(source).toContain("const pendingLongPress = longPressTimer !== null");
    expect(source).toContain("if (pendingLongPress) longPressTriggered = true");
    expect(source).not.toMatch(/localStorage|sessionStorage/);
  });
});
