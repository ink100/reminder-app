<script setup lang="ts">
const props = withDefaults(defineProps<{ initialClientKey?: string; reminderId?: string; initialValidDays?: string }>(), { initialClientKey: "", reminderId: "", initialValidDays: "7" });
const clientKey = ref(props.initialClientKey);
const validDays = ref(Number(props.initialValidDays) > 0 ? Number(props.initialValidDays) : 7);
const busy = ref(false);
const message = ref("");
const download = ref<{ url: string; name: string } | null>(null);

function filename(header: string | null) {
  const utf = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = header?.match(/filename="?([^";]+)"?/i)?.[1];
  try { return decodeURIComponent(utf || plain || "license.key"); } catch { return "license.key"; }
}
function cleanup() { if (download.value) URL.revokeObjectURL(download.value.url); download.value = null; }
onBeforeUnmount(cleanup);
async function generate() {
  const normalized = clientKey.value.trim().replace(/\s+/g, "");
  if (!normalized || !Number.isInteger(validDays.value) || validDays.value < 1) { message.value = "请填写激活码和有效天数"; return; }
  busy.value = true; message.value = "生成中..."; cleanup();
  try {
    const response = await fetch("/api/license/generate", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientKey: normalized, validDays: validDays.value, reminderId: props.reminderId || undefined }) });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "生成失败"); }
    const item = { url: URL.createObjectURL(await response.blob()), name: filename(response.headers.get("content-disposition")) };
    download.value = item;
    const link = document.createElement("a"); link.href = item.url; link.download = item.name; link.rel = "noopener"; link.click();
    const due = response.headers.get("x-linked-reminder-due-at");
    message.value = due ? `授权文件已生成，并已同步关联提醒到 ${new Date(due).toLocaleString("zh-CN")}` : "授权文件已生成；如果没有自动下载，请点击下载按钮。";
  } catch (error) { message.value = error instanceof Error ? error.message : "生成失败"; }
  finally { busy.value = false; }
}
</script>

<template>
  <el-card shadow="never">
    <el-alert v-if="reminderId" title="已关联提醒：生成成功后会同步有效天数。" type="info" :closable="false" class="notice" />
    <el-form label-position="top" @submit.prevent="generate">
      <el-form-item label="激活码 / Client Key"><el-input v-model="clientKey" type="textarea" :rows="6" placeholder="请输入客户端提供的激活码 / Client Key" /></el-form-item>
      <el-form-item label="有效天数"><el-input-number v-model="validDays" :min="1" :precision="0" /></el-form-item>
      <div class="actions"><el-text type="info">{{ message || "当前生成密匙暂不需要 OTP 验证码。" }}</el-text><el-button native-type="submit" type="primary" :loading="busy">生成 .key 文件</el-button></div>
    </el-form>
    <el-alert v-if="download" type="success" :closable="false" class="download"><template #title>文件已生成：{{ download.name }}</template><a :href="download.url" :download="download.name">下载授权 .key 文件</a></el-alert>
  </el-card>
</template>
<style scoped>.notice{margin-bottom:16px}.actions{display:flex;gap:16px;align-items:center;justify-content:space-between}.download{margin-top:16px}.download a{display:inline-block;margin-top:8px;color:var(--el-color-primary)}@media(max-width:600px){.actions{align-items:stretch;flex-direction:column}.actions .el-button{width:100%}}</style>
