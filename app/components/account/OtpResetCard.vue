<script setup lang="ts">
import { ElMessage, ElMessageBox } from "element-plus";

const props = defineProps<{ hasOtherFactor: boolean }>();
const { apiFetch } = useApi();
const { clearAuth } = useAuth();
const submitting = ref(false);

async function resetOtp() {
  if (!props.hasOtherFactor) {
    ElMessage.warning("OTP 是您唯一的登录方式，请先添加通行密匙");
    return;
  }
  try {
    await ElMessageBox.confirm(
      "重置会清空 OTP 配置，并立即注销您的所有会话。请确认已保留其他登录方式。",
      "重置 OTP？",
      { type: "error", confirmButtonText: "确认重置", cancelButtonText: "取消", confirmButtonClass: "el-button--danger" },
    );
  } catch { return; }

  submitting.value = true;
  try {
    const result = await apiFetch<{ success?: boolean; error?: string }>("/api/settings/otp/reset", { method: "POST" });
    if (!result.success) throw new Error(result.error || "重置 OTP 失败");
    clearAuth();
    ElMessage.success("OTP 已重置，请重新登录");
    await navigateTo("/auth");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "重置 OTP 失败");
  } finally { submitting.value = false; }
}
</script>

<template>
  <el-card shadow="never" class="danger-card">
    <h2>重置 OTP</h2>
    <p>高风险操作：会清空 OTP 配置并让全部会话立即失效。</p>
    <el-alert v-if="!hasOtherFactor" title="OTP 是唯一登录方式。请先添加通行密匙，避免锁定账户。" type="warning" :closable="false" show-icon />
    <el-button type="danger" :disabled="!hasOtherFactor" :loading="submitting" @click="resetOtp">重置 OTP</el-button>
  </el-card>
</template>

<style scoped>
.danger-card { border-color: var(--el-color-danger-light-5); }
h2, p { margin: 0; }
p { margin: 8px 0 16px; color: var(--el-color-danger); }
.el-alert { margin-bottom: 16px; }
</style>
