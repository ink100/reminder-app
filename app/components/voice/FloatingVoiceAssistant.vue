<script setup lang="ts">
import { buildVoiceAssistantRequestMessages, type VoiceAssistantChatMessage as ChatMessage } from "@/lib/voice/conversation";

type AssistantStatus = { ready: boolean; allowMutations: boolean; defaultVoice: string };

const { apiFetch } = useApi();
const open = ref(false);
const messages = ref<ChatMessage[]>([]);
const sending = ref(false);
const acquiring = ref(false);
const recording = ref(false);
const transcribing = ref(false);
const speakingIndex = ref<number | null>(null);
const ready = ref<boolean | null>(null);
const allowMutations = ref(false);
const defaultVoice = ref("zh-CN-XiaoxiaoNeural");
const pendingTranscript = ref("");

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let disposed = false;
let transcriptionController: AbortController | null = null;
let transcriptionGeneration = 0;
let recordingGeneration = 0;
let speechController: AbortController | null = null;
let speechGeneration = 0;
let speechUrl = "";
let speechAudio: HTMLAudioElement | null = null;
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressTriggered = false;
let recordingRequested = false;

const interactionStatus = computed(() => {
  if (recording.value) return "正在聆听…";
  if (acquiring.value) return "正在连接麦克风…";
  if (transcribing.value) return "语音识别中…";
  if (sending.value) return "AI 正在思考…";
  return "按住说话";
});

async function loadStatus() {
  try {
    const status = await apiFetch<AssistantStatus>("/api/voice/assistant");
    if (disposed) return;
    ready.value = status.ready;
    allowMutations.value = status.allowMutations;
    defaultVoice.value = status.defaultVoice || "zh-CN-XiaoxiaoNeural";
  } catch {
    if (!disposed) ready.value = false;
  }
}

function releaseSpeech() {
  speechGeneration++;
  speechController?.abort();
  speechController = null;
  if (speechAudio) {
    speechAudio.onended = null;
    speechAudio.onerror = null;
    speechAudio.pause();
  }
  speechAudio = null;
  if (speechUrl) URL.revokeObjectURL(speechUrl);
  speechUrl = "";
  speakingIndex.value = null;
}

function releaseRecorder() {
  if (recorder) {
    recorder.ondataavailable=null;
    recorder.onstop=null;
    if (recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* recorder already stopping */ }
    }
  }
  recorder = null;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  recording.value = false;
  acquiring.value = false;
}

function cancelLongPress() {
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = null;
}

function closePanel() {
  const pendingLongPress = longPressTimer !== null;
  cancelLongPress();
  if (pendingLongPress) longPressTriggered = true;
  open.value = false;
  recordingRequested = false;
  recordingGeneration++;
  transcriptionGeneration++;
  transcriptionController?.abort();
  transcriptionController = null;
  transcribing.value = false;
  releaseRecorder();
  releaseSpeech();
}

function beginLongPress(event: PointerEvent) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  cancelLongPress();
  longPressTriggered = false;
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    longPressTriggered = true;
    recordingRequested = true;
    open.value = true;
    void loadStatus();
    void nextTick(() => void startRecording());
  }, 550);
}

function togglePanel() {
  if (longPressTriggered) {
    longPressTriggered = false;
    return;
  }
  if (open.value) closePanel();
  else {
    open.value = true;
    void loadStatus();
  }
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === "Escape" && open.value) closePanel();
}

onMounted(() => window.addEventListener("keydown", handleEscape));
onBeforeUnmount(() => {
  disposed = true;
  cancelLongPress();
  window.removeEventListener("keydown", handleEscape);
  closePanel();
});

async function sendMessage(content: string) {
  const text = content.trim();
  if (!text || sending.value) return;

  if (ready.value !== true) {
    ElMessage.error("AI 语音助手尚未配置，请管理员前往配置中心完成设置");
    return;
  }

  if (allowMutations.value) {
    try {
      await ElMessageBox.confirm(
        "本次请求允许 AI 创建或修改提醒/待办。确认继续？",
        "确认 AI 修改权限",
        { type: "warning", confirmButtonText: "确认并发送", cancelButtonText: "取消" },
      );
    } catch { return; }
  }

  const requestMessages = buildVoiceAssistantRequestMessages(messages.value, text);
  sending.value = true;
  try {
    const result = await apiFetch<{ reply: string; partial?: boolean }>("/api/voice/assistant", {
      method: "POST",
      body: { messages: requestMessages, allowMutationsConfirmed: allowMutations.value },
    });
    messages.value = [...requestMessages, { role: "assistant", content: result.reply || "（AI 未返回文字）" }];
    pendingTranscript.value = "";
    if (result.partial) ElMessage.warning("部分操作已执行，请检查业务结果，勿直接重试");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "AI 请求失败");
  } finally {
    sending.value = false;
  }
}

async function transcribe(file: File) {
  transcriptionController?.abort();
  const controller = new AbortController();
  const generation = ++transcriptionGeneration;
  transcriptionController = controller;
  transcribing.value = true;
  try {
    const body = new FormData();
    body.append("file", file);
    const result = await apiFetch<{ text: string }>("/api/voice/transcriptions", {
      method: "POST",
      body,
      signal: controller.signal,
    });
    if (disposed || generation !== transcriptionGeneration) return;
    const text = result.text?.trim() || "";
    if (text) {
      pendingTranscript.value = text;
      await sendMessage(text);
    }
    else ElMessage.warning("未识别到有效语音");
  } catch (error) {
    if (generation === transcriptionGeneration && !controller.signal.aborted) {
      ElMessage.error(error instanceof Error ? error.message : "语音转写失败");
    }
  } finally {
    if (generation === transcriptionGeneration) {
      transcriptionController = null;
      transcribing.value = false;
    }
  }
}

async function startRecording() {
  if (acquiring.value || recording.value || recorder || transcribing.value || sending.value) return;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    recordingRequested = false;
    ElMessage.error("当前浏览器不支持录音");
    return;
  }
  if (ready.value === null) await loadStatus();
  if (ready.value !== true || !recordingRequested) {
    recordingRequested = false;
    if (ready.value === false) ElMessage.error("AI 语音助手尚未配置，请管理员前往配置中心完成设置");
    return;
  }
  acquiring.value = true;
  const generation = ++recordingGeneration;
  let acquired: MediaStream | null = null;
  let activeRecorder: MediaRecorder | null = null;
  try {
    acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (disposed || !open.value || generation !== recordingGeneration || !recordingRequested) {
      acquired.getTracks().forEach((track) => track.stop());
      return;
    }
    activeRecorder = new MediaRecorder(acquired);
    const chunks: Blob[] = [];
    stream = acquired;
    recorder = activeRecorder;
    activeRecorder.ondataavailable = (event) => {
      if (!disposed && event.data.size) chunks.push(event.data);
    };
    activeRecorder.onstop = () => {
      activeRecorder!.ondataavailable=null;
      activeRecorder!.onstop=null;
      const type = activeRecorder!.mimeType || "audio/webm";
      const file = new File(chunks, `voice-assistant-${Date.now()}.webm`, { type });
      acquired!.getTracks().forEach((track) => track.stop());
      if (stream === acquired) stream = null;
      if (recorder === activeRecorder) recorder = null;
      recording.value = false;
      if (!disposed && open.value && file.size) void transcribe(file);
    };
    activeRecorder.start();
    recording.value = true;
  } catch {
    if (activeRecorder) {
      activeRecorder.ondataavailable=null;
      activeRecorder.onstop=null;
      if (activeRecorder.state !== "inactive") {
        try { activeRecorder.stop(); } catch { /* startup failed */ }
      }
    }
    acquired?.getTracks().forEach((track) => track.stop());
    if (stream === acquired) stream = null;
    if (recorder === activeRecorder) recorder = null;
    recording.value = false;
    if (!disposed && generation === recordingGeneration) ElMessage.error("无法访问麦克风，请检查浏览器权限");
  } finally {
    if (generation === recordingGeneration) acquiring.value = false;
  }
}

function stopRecording() {
  if (recorder?.state === "recording") {
    try { recorder.stop(); } catch { /* recorder already stopping */ }
  }
}

function endRecordingRequest() {
  recordingRequested = false;
  if (recorder?.state === "recording") stopRecording();
  else if (acquiring.value) {
    recordingGeneration++;
    acquiring.value = false;
  }
}

function beginPanelRecording(event: PointerEvent) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.setPointerCapture?.(event.pointerId);
  pendingTranscript.value = "";
  recordingRequested = true;
  void startRecording();
}

function endPanelRecording() {
  endRecordingRequest();
}

function endLongPress() {
  cancelLongPress();
  if (longPressTriggered || recording.value || acquiring.value) endRecordingRequest();
}

async function speak(content: string, index: number) {
  releaseSpeech();
  const generation = speechGeneration;
  const controller = new AbortController();
  speechController = controller;
  speakingIndex.value = index;
  try {
    const response = await fetch("/api/voice/tts", {
      method: "POST",
      credentials: "same-origin",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: content, voice: defaultVoice.value, speed: 1, pitch: 0, volume: 0 }),
    });
    if (!response.ok) throw new Error("语音播放生成失败");
    const blob = await response.blob();
    if (disposed || !open.value || generation !== speechGeneration) return;
    speechController = null;
    speechUrl = URL.createObjectURL(blob);
    const audio = new Audio(speechUrl);
    speechAudio = audio;
    const releaseCurrentAudio = () => {
      if (generation === speechGeneration && speechAudio === audio) releaseSpeech();
    };
    audio.onended = releaseCurrentAudio;
    audio.onerror = releaseCurrentAudio;
    await audio.play();
  } catch (error) {
    if (generation !== speechGeneration || controller.signal.aborted) return;
    releaseSpeech();
    ElMessage.error(error instanceof Error ? error.message : "语音播放失败");
  }
}
</script>

<template>
  <div class="floating-assistant">
    <Transition name="assistant-panel">
      <section v-if="open" class="assistant-window" role="dialog" aria-modal="false" aria-label="AI 语音助手">
        <header class="assistant-header">
          <div class="assistant-avatar" aria-hidden="true">🎙</div>
          <div class="assistant-title">
            <strong>AI 语音助手</strong>
            <small>语音交互</small>
          </div>
          <span :class="['online-status', { unavailable: ready === false, checking: ready === null }]">
            {{ ready === null ? '检查中…' : ready ? '在线' : '未配置' }}
          </span>
          <ElButton text class="close-button" aria-label="关闭 AI 语音助手" @click="closePanel">✕</ElButton>
        </header>

        <div class="assistant-body">
          <div class="message-list" aria-live="polite">
            <div v-if="!messages.length" class="welcome-message">
              <div class="welcome-icon" aria-hidden="true">✨</div>
              <strong>你好，我是语音助手</strong>
              <p>按住下方按钮说话，我会展示识别文本并用文字回复。</p>
            </div>
            <div v-for="(message, index) in messages" :key="index" :class="['message-row', message.role]">
              <div class="message-label">{{ message.role === 'user' ? '语音识别文本' : 'AI 回复' }}</div>
              <div class="message-bubble">
                <p>{{ message.content }}</p>
                <ElButton
                  v-if="message.role === 'assistant'"
                  text
                  size="small"
                  type="primary"
                  :loading="speakingIndex === index"
                  @click="speak(message.content, index)"
                >🔊 播放回复</ElButton>
              </div>
            </div>
            <div v-if="pendingTranscript" class="message-row user pending-message">
              <div class="message-label">语音识别文本</div>
              <div class="message-bubble"><p>{{ pendingTranscript }}</p></div>
            </div>
            <div v-if="sending" class="thinking" aria-label="AI 正在生成回复"><i/><i/><i/></div>
          </div>

          <div class="voice-control" :class="{ active: recording }">
            <strong>{{ interactionStatus }}</strong>
            <div class="waveform" aria-hidden="true">
              <i v-for="bar in 18" :key="bar" :style="{ '--bar': bar }" />
            </div>
            <button
              type="button"
              class="hold-to-talk"
              :disabled="transcribing || sending"
              aria-label="按住说话，松开结束"
              @pointerdown.prevent="beginPanelRecording"
              @pointerup.prevent="endPanelRecording"
              @pointercancel.prevent="endPanelRecording"
              @pointerleave="(recording || acquiring) && endPanelRecording()"
              @contextmenu.prevent
            >
              <span aria-hidden="true">🎙</span>
              <b>{{ recording ? '松开结束' : '按住说话' }}</b>
            </button>
            <small>长按录音 · 松开结束</small>
          </div>
        </div>
      </section>
    </Transition>

    <span v-if="!open" class="launcher-label">AI 语音</span>
    <button
      type="button"
      class="assistant-launcher"
      aria-label="打开 AI 语音助手"
      title="点击展开；长按直接录音"
      :aria-expanded="open"
      @pointerdown="beginLongPress"
      @pointerup="endLongPress"
      @pointercancel="endLongPress"
      @pointerleave="endLongPress"
      @contextmenu.prevent
      @click="togglePanel"
    >
      <span aria-hidden="true">🎙</span>
    </button>
  </div>
</template>

<style scoped>
.floating-assistant { position: fixed; z-index: 70; right: 24px; bottom: 24px; }
.assistant-launcher { display: grid; width: 62px; height: 62px; place-items: center; border: 1px solid #1d4ed8; border-radius: 50%; background: #2563eb; box-shadow: 0 12px 28px rgb(37 99 235 / 35%); color: white; cursor: pointer; font-size: 24px; touch-action: manipulation; user-select: none; transition: transform .18s ease, box-shadow .18s ease; }
.assistant-launcher:hover { box-shadow: 0 15px 34px rgb(37 99 235 / 45%); transform: translateY(-2px); }
.assistant-launcher:focus-visible, .hold-to-talk:focus-visible { outline: 3px solid #93c5fd; outline-offset: 3px; }
.launcher-label { position: absolute; right: 72px; bottom: 12px; width: max-content; padding: 8px 12px; border-radius: 18px; background: #0f172a; box-shadow: 0 6px 18px rgb(15 23 42 / 20%); color: white; font-size: 12px; font-weight: 600; }
.assistant-window { position: absolute; right: 0; bottom: 76px; display: flex; width: min(390px, calc(100vw - 32px)); height: min(650px, calc(100dvh - 124px)); max-height: min(650px, calc(100dvh - 124px)); flex-direction: column; overflow: hidden; border: 1px solid #bfdbfe; border-radius: 20px; background: #fff; box-shadow: 0 22px 55px rgb(15 23 42 / 25%); }
.assistant-header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid #dbeafe; background: #fff; color: #0f172a; }
.assistant-title { display: grid; flex: 1; gap: 2px; }
.assistant-title small { color: #64748b; font-size: 11px; }
.assistant-avatar { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 50%; background: #2563eb; color: #fff; }
.online-status { display: inline-flex; align-items: center; gap: 5px; color: #15803d; font-size: 12px; }
.online-status::before { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; content: ""; }
.online-status.unavailable { color: #b45309; }
.online-status.unavailable::before { background: #f59e0b; }
.online-status.checking { color: #64748b; }
.online-status.checking::before { background: #94a3b8; }
.close-button { color: #64748b; }
.assistant-body { display: flex; min-height: 0; flex: 1; flex-direction: column; padding: 0 14px 14px; }
.message-list { display: grid; min-height: 180px; flex: 1; align-content: start; gap: 14px; overflow-y: auto; padding: 18px 2px; }
.welcome-message { display: grid; justify-items: center; gap: 8px; padding: 32px 18px; color: #334155; text-align: center; }
.welcome-message p { max-width: 260px; margin: 0; color: #64748b; font-size: 13px; line-height: 1.6; }
.welcome-icon { display: grid; width: 46px; height: 46px; place-items: center; border-radius: 50%; background: #eff6ff; }
.message-row { display: grid; max-width: 88%; gap: 5px; }
.message-row.user { justify-self: end; }
.message-label { color: #94a3b8; font-size: 11px; }
.message-row.user .message-label { text-align: right; }
.message-bubble { padding: 10px 12px; border-radius: 14px 14px 14px 4px; background: #f1f5f9; color: #334155; }
.message-row.user .message-bubble { border-radius: 14px 14px 4px; background: #dbeafe; color: #1e3a8a; }
.pending-message { opacity: .78; }
.message-bubble p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.6; }
.message-bubble .el-button { margin-top: 5px; padding-left: 0; }
.thinking { display: flex; gap: 5px; padding: 10px 12px; }
.thinking i { width: 7px; height: 7px; border-radius: 50%; background: #60a5fa; animation: pulse 1.2s infinite ease-in-out; }
.thinking i:nth-child(2) { animation-delay: .15s; }
.thinking i:nth-child(3) { animation-delay: .3s; }
.voice-control { display: grid; flex: none; justify-items: center; gap: 9px; padding: 14px 12px 10px; border: 1px solid #dbeafe; border-radius: 16px; background: #f8fbff; }
.voice-control > strong { color: #1e3a8a; font-size: 13px; }
.waveform { display: flex; height: 28px; align-items: center; justify-content: center; gap: 3px; }
.waveform i { width: 3px; height: 6px; border-radius: 3px; background: #93c5fd; }
.voice-control.active .waveform i { animation: wave .8s calc(var(--bar) * -.045s) infinite alternate ease-in-out; background: #2563eb; }
.hold-to-talk { display: inline-flex; min-width: 164px; min-height: 52px; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 28px; background: #2563eb; box-shadow: 0 9px 22px rgb(37 99 235 / 25%); color: #fff; cursor: pointer; touch-action: none; user-select: none; }
.hold-to-talk:disabled { cursor: not-allowed; opacity: .62; }
.voice-control.active .hold-to-talk { background: #dc2626; }
.voice-control > small { color: #94a3b8; font-size: 11px; }
.assistant-panel-enter-active, .assistant-panel-leave-active { transition: opacity .18s ease, transform .18s ease; }
.assistant-panel-enter-from, .assistant-panel-leave-to { opacity: 0; transform: translateY(10px) scale(.98); }
@keyframes wave { to { height: 25px; } }
@keyframes pulse { 0%, 80%, 100% { opacity: .35; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
@media (max-width: 767px) {
  .floating-assistant { right: 16px; bottom: calc(76px + env(safe-area-inset-bottom)); }
  .assistant-launcher { width: 58px; height: 58px; }
  .launcher-label { right: 68px; bottom: 11px; }
  .assistant-window { position: fixed; right: 12px; bottom: calc(146px + env(safe-area-inset-bottom)); width: calc(100vw - 24px); height: min(68dvh, 630px); max-height: min(68dvh, 630px, calc(100dvh - 158px - env(safe-area-inset-bottom))); }
}
@media (max-width: 380px) {
  .assistant-body { padding-inline: 10px; }
  .assistant-window { right: 8px; width: calc(100vw - 16px); }
}
</style>
