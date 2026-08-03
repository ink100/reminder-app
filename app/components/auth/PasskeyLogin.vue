<script setup lang="ts">
import { onMounted, ref } from "vue";

type LoginMode = "platform" | "hybrid";
const props = withDefaults(defineProps<{ redirectTo?: string }>(), { redirectTo: "/reminders" });
const emit = defineEmits<{ success: [] }>();
const supported = ref(true);
const loadingMode = ref<LoginMode | null>(null);
const status = ref<"idle" | "loading" | "error">("idle");
const message = ref("");
const rememberDevice = ref(true);

onMounted(async () => {
  try {
    const webauthn = await import("@simplewebauthn/browser");
    supported.value = webauthn.browserSupportsWebAuthn();
  } catch {
    supported.value = false;
  }
});

function friendlyError(error: unknown, mode: LoginMode) {
  if (!(error instanceof Error)) return "登录失败";
  if (error.name === "NotAllowedError" || error.message.toLowerCase().includes("not allowed")) {
    return mode === "hybrid"
      ? "未完成手机扫码验证，或验证窗口已超时。请重新点击“手机扫码登录”。"
      : "未完成本机验证。如果 Edge 没有可用通行密匙，请改用“手机扫码登录”。";
  }
  if (error.name === "SecurityError") return "通行密匙域名校验失败，请确认使用 https://ne.daydreams.cn 访问，不要用 IP 或其它域名。";
  if (error.name === "AbortError") return "验证已取消，请重试。";
  return error.message || "登录失败";
}

async function readJson(response: Response) {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

async function login(mode: LoginMode) {
  if (!supported.value) {
    status.value = "error";
    message.value = "您的浏览器不支持通行密匙";
    return;
  }
  loadingMode.value = mode;
  status.value = "loading";
  message.value = mode === "hybrid" ? "正在准备手机扫码登录..." : "正在准备本机通行密匙...";
  try {
    const optionsResponse = await fetch(`/api/auth/passkey/login?mode=${mode}`, { credentials: "same-origin" });
    const options = await readJson(optionsResponse);
    if (!optionsResponse.ok) throw new Error(String(options.error || "获取认证选项失败"));

    message.value = mode === "hybrid" ? "请在 Edge 弹窗中选择手机/扫码完成验证..." : "请完成本机验证...";
    // Keep browser-only WebAuthn code out of Nuxt's server execution path.
    const { startAuthentication } = await import("@simplewebauthn/browser");
    const credential = await startAuthentication({ optionsJSON: options as never });
    message.value = "正在验证...";
    const verifyResponse = await fetch("/api/auth/passkey/login/verify", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...credential, rememberDevice: rememberDevice.value }),
    });
    const result = await readJson(verifyResponse);
    if (!verifyResponse.ok || result.verified !== true) throw new Error(String(result.error || "登录失败"));
    emit("success");
    await navigateTo(props.redirectTo, { replace: true });
  } catch (error) {
    status.value = "error";
    message.value = friendlyError(error, mode);
  } finally {
    loadingMode.value = null;
  }
}
</script>

<template>
  <div class="passkey-login">
    <ElAlert v-if="!supported" title="您的浏览器不支持通行密匙（WebAuthn）。" type="warning" :closable="false" show-icon />
    <template v-else>
      <div class="buttons">
        <ElButton :loading="loadingMode === 'platform'" :disabled="loadingMode !== null" @click="login('platform')">本机登录</ElButton>
        <ElButton type="primary" :loading="loadingMode === 'hybrid'" :disabled="loadingMode !== null" @click="login('hybrid')">手机扫码登录</ElButton>
      </div>
      <p class="hint">Edge 无法直接唤起时，请点“手机扫码登录”。</p>
      <div class="trust-row">
        <ElCheckbox v-model="rememberDevice">信任这台设备 30 天</ElCheckbox>
        <small>之后在这台设备上可自动恢复登录，可在设置中撤销。</small>
      </div>
      <ElAlert v-if="message" :title="message" :type="status === 'error' ? 'error' : 'info'" :closable="false" show-icon />
    </template>
  </div>
</template>

<style scoped>
.passkey-login { display: grid; gap: 16px; }
.buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.buttons .el-button { width: 100%; margin: 0; }
.hint { margin: 0; text-align: center; color: var(--el-text-color-secondary); font-size: 12px; }
.trust-row { padding: 10px 12px; border: 1px solid var(--el-border-color); border-radius: 10px; background: var(--el-fill-color-light); }
.trust-row small { display: block; padding-left: 24px; color: var(--el-text-color-secondary); }
@media (max-width: 420px) { .buttons { grid-template-columns: 1fr; } }
</style>
