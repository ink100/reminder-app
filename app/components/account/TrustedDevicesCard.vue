<script setup lang="ts">
import { ElMessage, ElMessageBox } from "element-plus";

interface TrustedDevice {
  id: string;
  deviceName: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: string;
  lastUsedAt: string | null;
  createdAt: string;
}

const { apiFetch } = useApi();
const devices = ref<TrustedDevice[]>([]);
const loading = ref(true);
const revokingId = ref<string | null>(null);
const errorMessage = ref("");

function formatDate(value: string | null) {
  if (!value) return "从未使用";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function browserName(agent: string | null) {
  if (!agent) return "未知浏览器";
  if (agent.includes("Edg/")) return "Microsoft Edge";
  if (agent.includes("Chrome/")) return "Chrome / Chromium";
  if (agent.includes("Firefox/")) return "Firefox";
  if (agent.includes("Safari/") && !agent.includes("Chrome/")) return "Safari";
  return agent.slice(0, 72);
}
async function load() {
  loading.value = true; errorMessage.value = "";
  try {
    const result = await apiFetch<{ devices?: TrustedDevice[] }>("/api/auth/trusted/devices");
    devices.value = result.devices ?? [];
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : "加载可信设备失败"; }
  finally { loading.value = false; }
}
async function revoke(device: TrustedDevice) {
  try {
    await ElMessageBox.confirm(
      `撤销“${device.deviceName || "可信设备"}”后，该设备将不能自动恢复登录。`,
      "撤销可信设备？",
      { type: "warning", confirmButtonText: "撤销", cancelButtonText: "取消", confirmButtonClass: "el-button--danger" },
    );
  } catch { return; }
  revokingId.value = device.id;
  try {
    await apiFetch<{ success: boolean }>("/api/auth/trusted/devices", { method: "DELETE", body: { id: device.id } });
    devices.value = devices.value.filter(({ id }) => id !== device.id);
    ElMessage.success("可信设备已撤销");
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "撤销失败"); }
  finally { revokingId.value = null; }
}
onMounted(load);
</script>

<template>
  <el-card shadow="never" class="security-card">
    <template #header><div class="card-header"><div><h2>可信设备</h2><p>登录时选择信任后，设备可在有效期内自动恢复登录。</p></div><el-tag type="primary">{{ devices.length }} 台有效</el-tag></div></template>
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" :closable="false" show-icon />
    <el-skeleton v-if="loading" :rows="2" animated />
    <el-empty v-else-if="devices.length === 0" description="暂无可信设备" />
    <div v-else class="device-list">
      <div v-for="device in devices" :key="device.id" class="device-row">
        <div><strong>{{ device.deviceName || "可信设备" }}</strong><el-tag type="success" size="small">有效</el-tag><p>{{ browserName(device.userAgent) }}<span v-if="device.ipAddress"> · {{ device.ipAddress }}</span></p><p>最近使用：{{ formatDate(device.lastUsedAt) }} · 到期：{{ formatDate(device.expiresAt) }}</p></div>
        <el-button type="danger" plain :loading="revokingId === device.id" @click="revoke(device)">撤销</el-button>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.card-header, .device-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
h2, p { margin: 0; }
.card-header p, .device-row p { margin-top: 5px; color: var(--el-text-color-secondary); font-size: 13px; overflow-wrap: anywhere; }
.device-list { display: grid; gap: 12px; }
.device-row { padding: 14px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; }
.device-row strong { margin-right: 8px; }
@media (max-width: 640px) { .device-row { align-items: stretch; flex-direction: column; } }
</style>
