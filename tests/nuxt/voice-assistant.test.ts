import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("voice assistant Vue static contract", () => {
  it("supports MediaRecorder, audio upload/STT, auto send, tool traces, provider settings and TTS feedback", async () => {
    const source = await readFile("app/pages/voice.vue", "utf8");
    for (const contract of [
      "AI 语音助手", "MediaRecorder", "getUserMedia", "AUDIO_ACCEPT", "/api/voice/transcriptions",
      "/api/voice/assistant", "autoSend", "toolCalls", "Base URL", "API Key（不保存）", "System Prompt",
      "TTS 播放", "credentials:\"same-origin\"", 'layout: "default"', 'middleware: "auth"',
      "allowMutations", "确认 AI 修改权限", "部分操作已执行", "读取文本文件失败",
    ]) expect(source).toContain(contract);
    expect(source).not.toMatch(/localStorage|sessionStorage/);
  });

  it("does not reuse stale audio and cleans up microphone resources on unmount or late resolution", async () => {
    const source = await readFile("app/pages/voice.vue", "utf8");
    expect(source).toContain("audioFile.value=null");
    expect(source).toContain("if(!audio(file))return");
    expect(source).toContain("disposed=true");
    expect(source).toContain("recorder.ondataavailable=null");
    expect(source).toContain("recorder.onstop=null");
    expect(source).toContain('recorder.state!=="inactive"');
    expect(source).toContain("if(disposed){acquired.getTracks().forEach(track=>track.stop());return;}");
    expect(source).toContain("if(acquiring.value||recording.value||recorder)return");
    expect(source).toContain("const localChunks:Blob[]=[]");
    expect(source).toContain("acquired?.getTracks().forEach(track=>track.stop())");
  });

  it("scopes transcription state and autosend to the newest abortable request", async () => {
    const source = await readFile("app/pages/voice.vue", "utf8");
    expect(source).toContain("transcriptionController?.abort()");
    expect(source).toContain("const generation=++transcriptionGeneration");
    expect(source).toContain("signal:controller.signal");
    expect(source).toContain("generation!==transcriptionGeneration");
    expect(source).toContain("if(generation===transcriptionGeneration){transcriptionController=null;transcribing.value=false;}");
    expect(source).toContain("transcriptionGeneration++;transcriptionController?.abort()");
  });
});
