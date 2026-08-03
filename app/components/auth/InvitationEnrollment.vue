<script setup lang="ts">
import { computed, ref } from "vue";

type SetupPayload = { secret: string; qrCodeDataUrl: string; enrollmentId: string };
type Method = "totp" | "passkey";
const props = defineProps<{ token: string }>();
const method = ref<Method>("totp");
const setup = ref<SetupPayload | null>(null);
const code = ref("");
const busy = ref(false);
const message = ref("");
const completed = ref(false);
const activeStep = computed(() => completed.value ? 3 : setup.value ? 2 : busy.value ? 1 : 0);
const baseUrl = computed(() => `/api/invite/${encodeURIComponent(props.token)}`);

function normalizeCode(value: string) {
  code.value = value.replace(/\D/g, "").slice(0, 6);
  message.value = "";
}

async function json(response: Response) {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

function apiError(data: Record<string, unknown>, fallback: string) {
  return typeof data.error === "string" && data.error ? data.error : fallback;
}

function invitationError(response: Response, data: Record<string, unknown>, fallback: string) {
  // Preserve the backend's rate-limit message, while keeping the established Chinese invitation copy.
  return response.status === 429 ? apiError(data, "请求过于频繁") : fallback;
}

async function beginTotp() {
  busy.value = true;
  message.value = "";
  try {
    const response = await fetch(`${baseUrl.value}/totp/setup`, { method: "POST", credentials: "same-origin" });
    const data = await json(response);
    if (!response.ok) throw new Error(invitationError(response, data, "邀请无效或已过期"));
    if (typeof data.secret !== "string" || typeof data.qrCodeDataUrl !== "string" || typeof data.enrollmentId !== "string") {
      throw new TypeError("邀请初始化返回数据不完整");
    }
    setup.value = { secret: data.secret, qrCodeDataUrl: data.qrCodeDataUrl, enrollmentId: data.enrollmentId };
  } catch (error) {
    message.value = error instanceof Error ? error.message : "邀请无效或已过期";
  } finally {
    busy.value = false;
  }
}

async function verifyTotp() {
  if (!setup.value || !/^\d{6}$/.test(code.value)) {
    message.value = "请输入 6 位数字验证码";
    return;
  }
  busy.value = true;
  message.value = "";
  try {
    const response = await fetch(`${baseUrl.value}/totp/verify`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: code.value, enrollmentId: setup.value.enrollmentId }),
    });
    const data = await json(response);
    if (!response.ok || data.success !== true) throw new Error(invitationError(response, data, "邀请无效或验证码错误"));
    completed.value = true;
    window.location.replace("/reminders");
  } catch (error) {
    message.value = error instanceof Error ? error.message : "邀请无效或验证码错误";
  } finally {
    busy.value = false;
  }
}

async function enrollPasskey() {
  busy.value = true;
  message.value = "";
  try {
    const optionsResponse = await fetch(`${baseUrl.value}/passkey/options`, { method: "POST", credentials: "same-origin" });
    const options = await json(optionsResponse);
    if (!optionsResponse.ok) throw new Error(invitationError(optionsResponse, options, "无法接受邀请，请重新打开邀请链接后再试"));
    // The WebAuthn browser bundle is loaded only after a client interaction.
    const { startRegistration } = await import("@simplewebauthn/browser");
    const credential = await startRegistration({ optionsJSON: options as never });
    const verifyResponse = await fetch(`${baseUrl.value}/passkey/verify`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credential),
    });
    const result = await json(verifyResponse);
    if (!verifyResponse.ok || result.success !== true) throw new Error(invitationError(verifyResponse, result, "无法接受邀请，请重新打开邀请链接后再试"));
    completed.value = true;
    window.location.replace("/reminders");
  } catch (error) {
    message.value = error instanceof Error ? error.message : "无法接受邀请，请重新打开邀请链接后再试";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="enrollment">
    <ElSteps :active="activeStep" finish-status="success" align-center>
      <ElStep title="选择方式" />
      <ElStep title="创建凭据" />
      <ElStep title="安全验证" />
    </ElSteps>

    <ElSegmented v-model="method" :disabled="busy || completed" :options="[{ label: '验证器', value: 'totp' }, { label: '通行密匙', value: 'passkey' }]" block />

    <template v-if="!completed && method === 'totp'">
      <ElButton v-if="!setup" type="primary" size="large" :loading="busy" @click="beginTotp">生成独立验证密钥</ElButton>
      <ElForm v-else label-position="top" @submit.prevent="verifyTotp">
        <!-- Secret material stays in the response body and DOM; it is never copied to a URL or log. -->
        <img :src="setup.qrCodeDataUrl" alt="验证器二维码" class="qr-code">
        <div class="secret" aria-label="手动密钥">{{ setup.secret }}</div>
        <ElFormItem label="6 位验证码" required>
          <ElInput :model-value="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" @update:model-value="normalizeCode" />
        </ElFormItem>
        <ElButton type="primary" native-type="submit" size="large" :loading="busy" :disabled="code.length !== 6">验证并激活账户</ElButton>
      </ElForm>
    </template>

    <ElButton v-else-if="!completed" type="primary" size="large" :loading="busy" @click="enrollPasskey">创建通行密匙并激活</ElButton>
    <ElAlert v-else title="账户已激活，正在进入系统…" type="success" :closable="false" show-icon />
    <ElAlert v-if="message" :title="message" type="error" :closable="false" show-icon role="alert" />
  </div>
</template>

<style scoped>
.enrollment { display: grid; gap: 22px; }
.enrollment > .el-button, .el-form .el-button { width: 100%; }
.qr-code { display: block; width: 208px; height: 208px; max-width: 100%; margin: 0 auto 14px; }
.secret { margin-bottom: 16px; padding: 12px; border-radius: 8px; background: var(--el-fill-color-light); font-family: monospace; text-align: center; overflow-wrap: anywhere; }
</style>
