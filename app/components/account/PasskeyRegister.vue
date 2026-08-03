<script setup lang="ts">
import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { ElMessage } from "element-plus";

const emit = defineEmits<{ success: []; error: [message: string] }>();
const { apiFetch } = useApi();
const supported = import.meta.client ? browserSupportsWebAuthn() : true;
const loading = ref(false);
const status = ref("");

async function register(type: "platform" | "cross-platform") {
  if (!supported || loading.value) return;
  loading.value = true;
  status.value = type === "platform" ? "正在调用设备验证…" : "正在准备手机扫码…";
  try {
    const options = await apiFetch<Parameters<typeof startRegistration>[0]["optionsJSON"]>(
      `/api/auth/passkey/register?type=${type}`,
    );
    status.value = "请完成通行密匙验证…";
    const credential = await startRegistration({ optionsJSON: options });
    status.value = "正在验证…";
    const result = await apiFetch<{ verified?: boolean; error?: string }>("/api/auth/passkey/register/verify", {
      method: "POST",
      body: credential,
    });
    if (!result.verified) throw new Error(result.error || "通行密匙注册失败");
    status.value = "";
    ElMessage.success("通行密匙注册成功");
    emit("success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "通行密匙注册失败";
    status.value = message;
    ElMessage.error(message);
    emit("error", message);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <el-alert v-if="!supported" type="warning" :closable="false" show-icon>
    您的浏览器不支持通行密匙（WebAuthn），请使用最新版 Chrome、Safari、Edge 或 Firefox。
  </el-alert>
  <div v-else class="passkey-register">
    <p>选择设备内置验证（如 Windows Hello / Touch ID）或使用手机、安全密钥。</p>
    <div class="actions">
      <el-button type="primary" :loading="loading" @click="register('platform')">本机验证</el-button>
      <el-button :loading="loading" @click="register('cross-platform')">手机或安全密钥</el-button>
    </div>
    <el-text v-if="status" size="small">{{ status }}</el-text>
  </div>
</template>

<style scoped>
.passkey-register { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--el-border-color); border-radius: 8px; }
.passkey-register p { margin: 0; color: var(--el-text-color-secondary); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.actions .el-button + .el-button { margin-left: 0; }
</style>
