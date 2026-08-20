<script setup lang="ts">
type VoiceAssistantSettings = {
  provider: "openai-compatible";
  baseUrl: string;
  model: string;
  systemPrompt: string;
  allowMutations: boolean;
  defaultVoice: string;
  apiKeyConfigured: boolean;
};

const defaults: VoiceAssistantSettings = {
  provider: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  systemPrompt: "你是提醒事项语音助手。需要时使用工具，并简洁地用中文回复。",
  allowMutations: false,
  defaultVoice: "zh-CN-XiaoxiaoNeural",
  apiKeyConfigured: false,
};
const voices = [
  { label: "晓晓（女声）", value: "zh-CN-XiaoxiaoNeural" },
  { label: "云希（男声）", value: "zh-CN-YunxiNeural" },
  { label: "晓伊（女声）", value: "zh-CN-XiaoyiNeural" },
  { label: "云健（男声）", value: "zh-CN-YunjianNeural" },
  { label: "晓辰（女声）", value: "zh-CN-XiaochenNeural" },
];

const { apiFetch } = useApi();
const form = reactive({ ...defaults, apiKey: "", clearApiKey: false });
const loading = ref(true);
const saving = ref(false);
const message = ref("");

async function load() {
  loading.value = true;
  try {
    const data = await apiFetch<{ item: VoiceAssistantSettings }>("/api/settings/voice-assistant");
    Object.assign(form, data.item, { apiKey: "", clearApiKey: false });
  } catch (error) {
    message.value = error instanceof Error ? error.message : "加载 AI 语音助手配置失败";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => form.apiKey, (value) => { if (value) form.clearApiKey = false; });
watch(() => form.clearApiKey, (value) => { if (value) form.apiKey = ""; });

async function save() {
  saving.value = true;
  message.value = "";
  try {
    const data = await apiFetch<{ item: VoiceAssistantSettings }>("/api/settings/voice-assistant", {
      method: "PUT",
      body: {
        provider: form.provider,
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey,
        clearApiKey: form.clearApiKey,
        model: form.model.trim(),
        systemPrompt: form.systemPrompt.trim(),
        allowMutations: form.allowMutations,
        defaultVoice: form.defaultVoice,
      },
    });
    Object.assign(form, data.item, { apiKey: "", clearApiKey: false });
    message.value = "AI 语音助手配置已保存";
  } catch (error) {
    message.value = error instanceof Error ? error.message : "保存 AI 语音助手配置失败";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <ElCard v-loading="loading" shadow="never">
    <template #header>
      <div class="card-title">
        <div>
          <h2>AI 语音助手</h2>
          <ElText type="info">业务页面助手只展示语音交互和对话文本，所有配置统一在这里管理。</ElText>
        </div>
        <ElTag :type="form.apiKeyConfigured ? 'success' : 'warning'">
          {{ form.apiKeyConfigured ? 'API Key 已配置' : 'API Key 未配置' }}
        </ElTag>
      </div>
    </template>

    <ElForm label-position="top" @submit.prevent="save">
      <div class="grid">
        <ElFormItem label="AI Provider">
          <ElSelect v-model="form.provider" class="wide">
            <ElOption label="OpenAI 兼容接口" value="openai-compatible" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="模型">
          <ElInput v-model="form.model" maxlength="200" placeholder="例如 gpt-4o-mini" />
        </ElFormItem>
        <ElFormItem label="Base URL">
          <ElInput v-model="form.baseUrl" maxlength="500" placeholder="https://api.openai.com/v1" />
        </ElFormItem>
        <ElFormItem label="API Key">
          <ElInput
            v-model="form.apiKey"
            type="password"
            show-password
            autocomplete="new-password"
            maxlength="1000"
            :placeholder="form.apiKeyConfigured ? '已配置；留空保持不变' : '输入 Provider API Key'"
          />
          <ElCheckbox v-model="form.clearApiKey">清空已保存的 API Key</ElCheckbox>
        </ElFormItem>
        <ElFormItem label="默认语音">
          <ElSelect v-model="form.defaultVoice" class="wide" filterable>
            <ElOption v-for="voice in voices" :key="voice.value" :label="voice.label" :value="voice.value" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="MCP 权限">
          <div class="permission">
            <ElSwitch v-model="form.allowMutations" active-text="允许创建或修改提醒/待办" inactive-text="仅允许读取" />
            <ElText type="info">删除工具始终禁用；开启修改权限后，每次语音请求仍会要求确认。</ElText>
          </div>
        </ElFormItem>
      </div>
      <ElFormItem label="System Prompt">
        <ElInput v-model="form.systemPrompt" type="textarea" :rows="5" maxlength="8000" show-word-limit />
      </ElFormItem>
      <div class="actions">
        <ElAlert v-if="message" :title="message" type="info" :closable="false" show-icon />
        <ElButton type="primary" native-type="submit" :loading="saving">保存 AI 配置</ElButton>
      </div>
    </ElForm>
  </ElCard>
</template>

<style scoped>
h2 { margin: 0 0 4px; }
.card-title, .actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
.wide { width: 100%; }
.permission { display: grid; gap: 8px; }
.actions .el-alert { flex: 1; }
@media (max-width: 700px) {
  .card-title, .actions { align-items: stretch; flex-direction: column; }
  .grid { grid-template-columns: 1fr; }
}
</style>
