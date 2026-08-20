<script setup lang="ts">
type ChatMessage = { role: "user" | "assistant"; content: string };
type ToolTrace = { name: string; arguments: Record<string, unknown>; status: string; result: string };

const { apiFetch } = useApi();
const open = ref(false);
const settingsOpen = ref<string[]>([]);
const baseUrl = ref("");
const apiKey = ref("");
const model = ref("");
const systemPrompt = ref("你是提醒事项语音助手。需要时使用工具，并简洁地用中文回复。");
const allowMutations = ref(false);
const input = ref("");
const messages = ref<ChatMessage[]>([]);
const toolCalls = ref<ToolTrace[]>([]);
const sending = ref(false);
const acquiring = ref(false);
const recording = ref(false);
const transcribing = ref(false);
const speakingIndex = ref<number | null>(null);

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

function recorderState() {
  return recorder?.state || "inactive";
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

function closePanel() {
  const pendingLongPress = longPressTimer !== null;
  cancelLongPress();
  if (pendingLongPress) longPressTriggered = true;
  open.value = false;
  recordingGeneration++;
  transcriptionGeneration++;
  transcriptionController?.abort();
  transcriptionController = null;
  transcribing.value = false;
  releaseRecorder();
  releaseSpeech();
}

function cancelLongPress() {
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = null;
}

function beginLongPress(event: PointerEvent) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  cancelLongPress();
  longPressTriggered = false;
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    longPressTriggered = true;
    open.value = true;
    void nextTick(() => void startRecording());
  }, 550);
}

function togglePanel() {
  if (longPressTriggered) {
    longPressTriggered = false;
    return;
  }
  if (open.value) closePanel();
  else open.value = true;
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
    input.value = result.text?.trim() || "";
    if (input.value) ElMessage.success("语音已转为文字，请确认后发送");
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
  if (acquiring.value || recording.value || recorder) return;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    ElMessage.error("当前浏览器不支持录音");
    return;
  }
  acquiring.value = true;
  const generation = ++recordingGeneration;
  let acquired: MediaStream | null = null;
  let activeRecorder: MediaRecorder | null = null;
  try {
    acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (disposed || !open.value || generation !== recordingGeneration) {
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

async function sendMessage() {
  const content = input.value.trim();
  if (!content) return ElMessage.error("请输入消息或先进行语音输入");
  if (!apiKey.value.trim()) {
    settingsOpen.value = ["settings"];
    return ElMessage.error("请先在 AI 配置中输入 API Key");
  }
  if (sending.value) return;
  if (allowMutations.value) {
    try {
      await ElMessageBox.confirm(
        "本次请求允许 AI 创建或修改提醒/待办。确认继续？",
        "确认 AI 修改权限",
        { type: "warning", confirmButtonText: "确认并发送", cancelButtonText: "取消" },
      );
    } catch { return; }
  }

  const requestMessages: ChatMessage[] = [...messages.value, { role: "user", content }];
  messages.value = requestMessages;
  input.value = "";
  sending.value = true;
  try {
    const result = await apiFetch<{ reply: string; toolCalls: ToolTrace[]; partial?: boolean }>("/api/voice/assistant", {
      method: "POST",
      body: {
        baseUrl: baseUrl.value,
        apiKey: apiKey.value,
        model: model.value,
        systemPrompt: systemPrompt.value,
        messages: requestMessages,
        allowMutations: allowMutations.value,
      },
    });
    toolCalls.value.push(...(result.toolCalls || []));
    messages.value.push({ role: "assistant", content: result.reply || "（AI 未返回文字）" });
    if (result.partial) ElMessage.warning("部分操作已执行，请检查工具调用结果，勿直接重试");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "AI 请求失败");
  } finally {
    sending.value = false;
  }
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
      body: JSON.stringify({ input: content, voice: "zh-CN-XiaoxiaoNeural", speed: 1, pitch: 0, volume: 0 }),
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
          <div>
            <strong>AI 语音助手</strong>
            <small>语音 → AI → MCP 工具</small>
          </div>
          <ElButton text class="close-button" aria-label="关闭 AI 语音助手" @click="closePanel">✕</ElButton>
        </header>

        <div class="assistant-body">
          <ElCollapse v-model="settingsOpen" class="settings-collapse">
            <ElCollapseItem title="AI 配置（Key 仅保留在当前页面）" name="settings">
              <ElForm label-position="top" size="small">
                <ElFormItem label="Base URL">
                  <ElInput v-model="baseUrl" placeholder="留空使用服务器配置" />
                </ElFormItem>
                <ElFormItem label="API Key（不保存）">
                  <ElInput v-model="apiKey" type="password" show-password autocomplete="off" />
                </ElFormItem>
                <ElFormItem label="Model">
                  <ElInput v-model="model" placeholder="留空使用服务器配置" />
                </ElFormItem>
                <ElFormItem label="System Prompt">
                  <ElInput v-model="systemPrompt" type="textarea" :rows="3" maxlength="8000" />
                </ElFormItem>
                <ElSwitch v-model="allowMutations" active-text="允许创建或修改提醒/待办" />
              </ElForm>
            </ElCollapseItem>
          </ElCollapse>

          <div ref="messageList" class="message-list" aria-live="polite">
            <ElEmpty v-if="!messages.length" :image-size="54" description="点击麦克风说话，或直接输入消息" />
            <div v-for="(message, index) in messages" :key="index" :class="['message', message.role]">
              <b>{{ message.role === 'user' ? '你' : 'AI' }}</b>
              <p>{{ message.content }}</p>
              <ElButton
                v-if="message.role === 'assistant'"
                text
                size="small"
                type="primary"
                :loading="speakingIndex === index"
                @click="speak(message.content, index)"
              >🔊 播放</ElButton>
            </div>
          </div>

          <ElCollapse v-if="toolCalls.length" class="tool-traces">
            <ElCollapseItem title="MCP 工具调用过程">
              <div v-for="(call, index) in toolCalls" :key="index" class="tool-trace">
                <ElTag size="small" :type="call.status === 'success' ? 'success' : 'danger'">{{ call.name }}</ElTag>
                <small>{{ call.result }}</small>
              </div>
            </ElCollapseItem>
          </ElCollapse>

          <div class="composer">
            <ElInput
              v-model="input"
              type="textarea"
              :rows="2"
              maxlength="8000"
              placeholder="输入消息，或点击麦克风说话…"
              @keydown.ctrl.enter="sendMessage"
            />
            <div class="composer-actions">
              <ElButton
                v-if="!recording"
                type="danger"
                plain
                :loading="acquiring || transcribing"
                :disabled="acquiring || transcribing || recorderState() !== 'inactive'"
                @click="startRecording"
              >🎙 语音输入</ElButton>
              <ElButton v-else type="warning" @click="stopRecording">⏹ 停止录音</ElButton>
              <ElButton type="primary" :loading="sending" :disabled="transcribing" @click="sendMessage">发送</ElButton>
            </div>
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
      @pointerup="cancelLongPress"
      @pointercancel="cancelLongPress"
      @pointerleave="cancelLongPress"
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
.assistant-launcher:focus-visible { outline: 3px solid #93c5fd; outline-offset: 3px; }
.launcher-label { position: absolute; right: 72px; bottom: 12px; width: max-content; padding: 8px 12px; border-radius: 18px; background: #0f172a; box-shadow: 0 6px 18px rgb(15 23 42 / 20%); color: white; font-size: 12px; font-weight: 600; }
.assistant-window { position: absolute; right: 0; bottom: 76px; display: flex; width: min(390px, calc(100vw - 32px)); max-height: min(720px, calc(100dvh - 124px)); flex-direction: column; overflow: hidden; border: 1px solid #bfdbfe; border-radius: 18px; background: white; box-shadow: 0 22px 55px rgb(15 23 42 / 25%); }
.assistant-header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; background: #2563eb; color: white; }
.assistant-header > div:nth-child(2) { display: grid; flex: 1; gap: 2px; }
.assistant-header small { color: #dbeafe; font-size: 11px; }
.assistant-avatar { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 50%; background: white; color: #2563eb; }
.close-button { color: white; }
.assistant-body { display: flex; min-height: 0; flex: 1; flex-direction: column; padding: 0 14px 14px; }
.settings-collapse, .tool-traces { flex: none; }
.settings-collapse :deep(.el-collapse-item__content) { max-height: 330px; overflow: auto; padding-right: 4px; }
.settings-collapse :deep(.el-form-item) { margin-bottom: 10px; }
.message-list { display: grid; min-height: 160px; flex: 1; align-content: start; gap: 10px; overflow-y: auto; padding: 14px 2px; }
.message { max-width: 86%; padding: 10px 12px; border-radius: 12px; background: #f1f5f9; color: #334155; }
.message.user { justify-self: end; background: #dbeafe; color: #1e3a8a; }
.message p { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; line-height: 1.55; }
.tool-trace { display: grid; gap: 5px; margin-bottom: 8px; }
.tool-trace small { color: #64748b; overflow-wrap: anywhere; }
.composer { display: grid; flex: none; gap: 10px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
.composer-actions { display: flex; justify-content: space-between; gap: 8px; }
.composer-actions .el-button { flex: 1; margin: 0; }
.assistant-panel-enter-active, .assistant-panel-leave-active { transition: opacity .18s ease, transform .18s ease; }
.assistant-panel-enter-from, .assistant-panel-leave-to { opacity: 0; transform: translateY(10px) scale(.98); }
@media (max-width: 767px) {
  .floating-assistant { right: 16px; bottom: calc(76px + env(safe-area-inset-bottom)); }
  .assistant-launcher { width: 58px; height: 58px; }
  .launcher-label { right: 68px; bottom: 11px; }
  .assistant-window { position: fixed; right: 12px; bottom: calc(146px + env(safe-area-inset-bottom)); width: calc(100vw - 24px); max-height: min(72dvh, 680px, calc(100dvh - 158px - env(safe-area-inset-bottom))); }
}
@media (max-width: 380px) {
  .assistant-body { padding-inline: 10px; }
  .assistant-window { right: 8px; width: calc(100vw - 16px); }
}
</style>
