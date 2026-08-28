<script setup lang="ts">
import { computed, reactive, ref } from "vue";

const props = withDefaults(defineProps<{ redirectTo?: string }>(), { redirectTo: "/reminders" });
const emit = defineEmits<{ success: [] }>();

const form = reactive({ username: "admin", code: "", rememberDevice: true });
const submitting = ref(false);
const message = ref("");
const codeComplete = computed(() => /^\d{6}$/.test(form.code));

function normalizeCode(value: string) {
  form.code = value.replace(/\D/g, "").slice(0, 6);
  message.value = "";
}

async function submit() {
  if (!codeComplete.value) {
    message.value = "请输入 6 位数字验证码";
    return;
  }
  submitting.value = true;
  message.value = "";
  try {
    const response = await fetch("/api/auth/otp/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await response.json().catch(() => ({})) as { error?: string; success?: boolean };
    if (!response.ok || !data.success) throw new Error(data.error || "登录失败");
    emit("success");
    await navigateTo(props.redirectTo, { replace: true });
  } catch (error) {
    message.value = error instanceof Error ? error.message : "登录失败";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <ElCard shadow="never" class="auth-card">
    <h2>使用动态验证码登录</h2>
    <p class="muted">输入 Google Authenticator 或 GitHub Mobile 当前显示的 6 位验证码。</p>
    <ElForm label-position="top" :model="form" @submit.prevent="submit">
      <ElFormItem label="用户名" required>
        <ElInput v-model="form.username" name="username" autocomplete="username" />
      </ElFormItem>
      <ElFormItem label="6 位动态验证码" required>
        <ElInput
          :model-value="form.code"
          name="code"
          autocomplete="one-time-code"
          inputmode="numeric"
          maxlength="6"
          placeholder="请输入 6 位验证码"
          @update:model-value="normalizeCode"
        />
      </ElFormItem>
      <div class="trust-row">
        <ElCheckbox v-model="form.rememberDevice">信任这台设备 30 天</ElCheckbox>
        <small>之后在这台设备上可自动恢复登录，可在设置中撤销。</small>
      </div>
      <ElAlert v-if="message" :title="message" type="error" :closable="false" show-icon />
      <ElButton class="submit" type="primary" native-type="submit" :loading="submitting" :disabled="submitting || !codeComplete">
        {{ submitting ? "验证中…" : "验证并登录" }}
      </ElButton>
    </ElForm>
  </ElCard>
</template>

<style scoped>
.auth-card { width: 100%; min-width: 0; border-color: #dbe3ee; border-radius: 16px; box-shadow: 0 12px 32px rgb(15 23 42 / 6%); }
.auth-card :deep(.el-card__body) { padding: 28px; }
h2 { margin: 0 0 8px; color: #0f172a; font-size: 21px; }
.muted { margin: 0 0 20px; color: var(--el-text-color-secondary); line-height: 1.6; }
.auth-card :deep(.el-input__wrapper) { min-height: 48px; border-radius: 10px; }
.auth-card :deep(.el-input__inner) { font-size: 16px; }
.trust-row { margin-bottom: 16px; padding: 12px 14px; border: 1px solid var(--el-border-color); border-radius: 10px; background: var(--el-fill-color-light); }
.trust-row small { display: block; padding-left: 24px; color: var(--el-text-color-secondary); }
.submit { width: 100%; min-height: 48px; margin-top: 16px; border-radius: 10px; font-size: 15px; font-weight: 600; }
@media (max-width: 480px) {
  .auth-card :deep(.el-card__body) { padding: 22px 20px; }
  .muted { font-size: 14px; }
}
</style>
