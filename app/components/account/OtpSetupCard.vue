<script setup lang="ts">
import { ElMessage } from "element-plus";

interface SetupPayload { secret: string; qrCodeDataUrl: string }
const emit = defineEmits<{ configured: [] }>();
const { apiFetch } = useApi();
const { fetchStatus } = useAuth();
const payload = ref<SetupPayload | null>(null);
const code = ref("");
const loading = ref(true);
const submitting = ref(false);
const errorMessage = ref("");

async function initialize() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const result = await apiFetch<Partial<SetupPayload>>("/api/auth/otp/setup", { method: "POST" });
    if (!result.secret || !result.qrCodeDataUrl) throw new Error("OTP 初始化返回数据不完整");
    payload.value = { secret: result.secret, qrCodeDataUrl: result.qrCodeDataUrl };
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "初始化 OTP 失败";
  } finally { loading.value = false; }
}

function normalize() { code.value = code.value.replace(/\D/g, "").slice(0, 6); }

async function verify() {
  if (!/^\d{6}$/.test(code.value)) return;
  submitting.value = true;
  errorMessage.value = "";
  try {
    const result = await apiFetch<{ success?: boolean; error?: string }>("/api/auth/otp/verify-setup", {
      method: "POST", body: { code: code.value },
    });
    if (!result.success) throw new Error(result.error || "OTP 验证失败");
    await fetchStatus(true);
    ElMessage.success("OTP 已绑定");
    emit("configured");
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "OTP 验证失败";
  } finally { submitting.value = false; }
}

onMounted(initialize);
</script>

<template>
  <el-card shadow="never" class="security-card">
    <template #header><div><h2>绑定 OTP 验证器</h2><p>使用 TOTP 应用扫码，然后输入 6 位验证码。</p></div></template>
    <el-skeleton v-if="loading" :rows="3" animated />
    <template v-else-if="payload">
      <div class="setup-grid">
        <img :src="payload.qrCodeDataUrl" width="180" height="180" alt="OTP 二维码">
        <div class="setup-form">
          <p>手动密钥：<el-text tag="code">{{ payload.secret }}</el-text></p>
          <el-input v-model="code" aria-label="6 位验证码" inputmode="numeric" maxlength="6" placeholder="123456" @input="normalize" @keyup.enter="verify" />
          <el-button type="primary" :disabled="!/^[0-9]{6}$/.test(code)" :loading="submitting" @click="verify">完成绑定</el-button>
        </div>
      </div>
    </template>
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" :closable="false" show-icon>
      <template #default><el-button v-if="!payload" link @click="initialize">重试</el-button></template>
    </el-alert>
  </el-card>
</template>

<style scoped>
h2, p { margin: 0; }
.el-card p { margin-top: 5px; color: var(--el-text-color-secondary); }
.setup-grid { display: flex; flex-wrap: wrap; align-items: center; gap: 24px; }
.setup-grid img { max-width: 100%; height: auto; }
.setup-form { flex: 1; min-width: 220px; display: grid; gap: 14px; }
.setup-form code { overflow-wrap: anywhere; }
</style>
