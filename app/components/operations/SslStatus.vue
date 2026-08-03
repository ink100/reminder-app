<script setup lang="ts">
import { ElMessageBox } from "element-plus";

type Status = {
  lastRenew: string | null;
  lastCheck?: string | null;
  lastResult: number | null;
  lastAction?: string | null;
  message?: string | null;
  expiry: string | null;
  updated: string | null;
  daysRemaining?: number;
  subject?: string;
  issuer?: string;
  serialNumber?: string;
  isExpired?: boolean;
  certificateAvailable?: boolean;
  certificateError?: string | null;
  reloadPending?: boolean;
};
type Data = { status: Status; acmeList: string; logs: string; certPath: string; renewScript: string };

const { apiFetch } = useApi();
const data = ref<Data | null>(null);
const loading = ref(true);
const renewing = ref(false);
const error = ref("");
const result = ref<{ success: boolean; skipped?: boolean; message: string } | null>(null);

async function load() {
  loading.value = true;
  try {
    data.value = await apiFetch<Data>("/api/ssl");
    error.value = "";
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : "获取 SSL 状态失败";
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function renew() {
  try {
    await ElMessageBox.confirm(
      "确定检查 SSL 证书吗？系统会遵循 acme.sh/CA 的续期时间，证书未变化时不会重载 nginx。",
      "检查并按需更新",
      { type: "warning" },
    );
  } catch {
    return;
  }

  renewing.value = true;
  result.value = null;
  try {
    const response = await apiFetch<{ success: boolean; skipped?: boolean; message?: string; error?: string }>("/api/ssl", { method: "POST" });
    result.value = {
      success: response.success,
      skipped: response.skipped,
      message: response.message || response.error || "检查完成",
    };
    if (response.success) await load();
  } catch (renewError) {
    result.value = { success: false, message: renewError instanceof Error ? renewError.message : "更新失败" };
    await load();
  } finally {
    renewing.value = false;
  }
}

function date(value?: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
}

const certificateState = computed<"unavailable" | "expired" | "expiring" | "valid">(() => {
  const status = data.value?.status;
  if (!status || status.certificateAvailable === false || !status.expiry || status.daysRemaining === undefined) return "unavailable";
  if (status.isExpired) return "expired";
  if (status.daysRemaining <= 30) return "expiring";
  return "valid";
});
const stateType = computed(() => ({ unavailable: "info", expired: "danger", expiring: "warning", valid: "success" } as const)[certificateState.value]);
const stateTitle = computed(() => ({ unavailable: "状态不可用", expired: "已过期", expiring: "即将到期", valid: "正常" } as const)[certificateState.value]);
const stateTag = computed(() => ({ unavailable: "需检查", expired: "需处理", expiring: "待续期", valid: "有效" } as const)[certificateState.value]);
const recentOperationFailed = computed(() => data.value?.status.lastAction === "failed" || (data.value?.status.lastResult ?? 0) !== 0);
</script>

<template>
  <div class="ssl">
    <header>
      <div><h1>SSL 证书管理</h1><p>管理和监控 SSL 证书状态</p></div>
      <div class="actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button type="primary" :loading="renewing" @click="renew">检查并按需更新</el-button>
      </div>
    </header>

    <el-alert v-if="error" :title="error" type="error" show-icon><el-button @click="load">重试</el-button></el-alert>
    <el-alert v-if="result" :title="result.message" :type="result.skipped ? 'warning' : result.success ? 'success' : 'error'" :closable="false" show-icon />
    <el-alert v-if="data?.status.reloadPending" :title="`新证书待加载：${data.status.message || 'nginx 尚未成功重载，将在下次检查时自动重试'}`" type="error" :closable="false" show-icon />
    <el-alert v-else-if="recentOperationFailed" :title="`最近操作失败：${data?.status.message || '请检查更新日志'}`" type="error" :closable="false" show-icon />
    <el-alert v-if="certificateState === 'unavailable' && data" :title="data.status.certificateError || '无法读取服务器证书，请检查证书文件和权限'" type="error" :closable="false" show-icon />

    <el-skeleton v-if="loading && !data" :rows="8" animated />
    <template v-else-if="data">
      <div class="stats">
        <el-card shadow="never"><el-text type="info">证书状态</el-text><h3>{{ stateTitle }} <el-tag :type="stateType">{{ stateTag }}</el-tag></h3></el-card>
        <el-card shadow="never"><el-text type="info">剩余天数</el-text><h3>{{ data.status.daysRemaining ?? '-' }}</h3></el-card>
        <el-card shadow="never"><el-text type="info">到期时间</el-text><h3>{{ date(data.status.expiry) }}</h3></el-card>
        <el-card shadow="never"><el-text type="info">上次检查</el-text><h3>{{ date(data.status.lastCheck || data.status.lastRenew) }}</h3></el-card>
      </div>

      <el-card shadow="never">
        <template #header><h2>证书详细信息</h2></template>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="域名 (Subject)">{{ data.status.subject || '-' }}</el-descriptions-item>
          <el-descriptions-item label="颁发机构 (Issuer)">{{ data.status.issuer || '-' }}</el-descriptions-item>
          <el-descriptions-item label="序列号">{{ data.status.serialNumber || '-' }}</el-descriptions-item>
          <el-descriptions-item label="证书路径">{{ data.certPath || '-' }}</el-descriptions-item>
          <el-descriptions-item label="最近结果" :span="2">{{ data.status.message || data.status.lastAction || '-' }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <el-card shadow="never"><template #header><h2>更新日志</h2></template><pre>{{ data.logs || '暂无日志' }}</pre></el-card>
      <el-card shadow="never"><template #header><h2>ACME 证书列表</h2></template><pre>{{ data.acmeList || '无数据' }}</pre></el-card>
      <el-alert title="系统每月 1 日和 15 日检查；进入 30 天窗口后仍遵循 acme.sh/CA 的实际续期时间，只有证书指纹变化才视为续签成功并重载 nginx。" type="info" :closable="false" />
    </template>
  </div>
</template>

<style scoped>
.ssl { display: grid; gap: 20px; }
header { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.actions { display: flex; gap: 8px; }
h1, h2, p { margin: 4px 0; }
.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
pre { max-height: 240px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; padding: 14px; background: var(--el-fill-color-lighter); border-radius: 6px; }
@media (max-width: 900px) { .stats { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px) { header { align-items: stretch; flex-direction: column; } .actions { display: grid; grid-template-columns: 1fr 1fr; } .stats { grid-template-columns: 1fr; } }
</style>
