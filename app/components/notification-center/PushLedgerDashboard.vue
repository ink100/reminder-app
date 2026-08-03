<script setup lang="ts">
import type { PushLedgerItem } from "./types";

const { apiFetch } = useApi();
const loading = ref(false);
const retrying = ref("");
const items = ref<PushLedgerItem[]>([]);
const total = ref(0);
const stats = reactive({ total: 0, success: 0, pending: 0, failed: 0 });
const filter = reactive({ q: "", status: "", channelType: "" });
const page = ref(1);
const pageSize = ref(20);
const statusOptions = ["Pending", "Processing", "Success", "RetryWaiting", "Failed", "DeadLetter", "Cancelled"];
const channelTypes = ["Telegram", "Email", "Webhook"];
const statusLabels: Record<string, string> = { Pending: "待推送", Processing: "推送中", Success: "推送成功", RetryWaiting: "等待重试", Failed: "推送失败", DeadLetter: "最终失败", Cancelled: "已取消" };
const statusTypes: Record<string, "success" | "warning" | "danger" | "info" | "primary"> = { Pending: "info", Processing: "primary", Success: "success", RetryWaiting: "warning", Failed: "danger", DeadLetter: "danger", Cancelled: "info" };

function query(overrides: Record<string, string | number> = {}) {
  const params = new URLSearchParams();
  const values = { status: filter.status, channel_type: filter.channelType, q: filter.q.trim(), limit: pageSize.value, offset: (page.value - 1) * pageSize.value, ...overrides };
  for (const [key, value] of Object.entries(values)) if (value !== "" && value !== undefined) params.set(key, String(value));
  return `/api/push-ledger?${params.toString()}`;
}
async function load(loadStats = false) {
  loading.value = true;
  try {
    const data = await apiFetch<{ items: PushLedgerItem[]; total: number }>(query());
    items.value = data.items; total.value = data.total;
    if (loadStats) {
      const statuses = await Promise.all(statusOptions.map(status => apiFetch<{ total: number }>(query({ status, limit: 1, offset: 0, q: "", channel_type: "" }))));
      const counts = Object.fromEntries(statusOptions.map((status, index) => [status, statuses[index]?.total || 0]));
      stats.success = counts.Success || 0;
      stats.pending = (counts.Pending || 0) + (counts.Processing || 0) + (counts.RetryWaiting || 0);
      stats.failed = (counts.Failed || 0) + (counts.DeadLetter || 0);
      stats.total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    }
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "推送台账加载失败"); }
  finally { loading.value = false; }
}
onMounted(() => load(true));
function search() { page.value = 1; void load(); }
function reset() { Object.assign(filter, { q: "", status: "", channelType: "" }); page.value = 1; void load(); }
function changePage(value: number) { page.value = value; void load(); }
function changeSize(value: number) { pageSize.value = value; page.value = 1; void load(); }
async function retry(item: PushLedgerItem) {
  if (!item.queue_job_id || retrying.value) return;
  try { await ElMessageBox.confirm(`将把“${item.title}”对应任务重新加入队列。请确认失败原因已处理。`, "重试推送任务", { type: "warning", confirmButtonText: "确认重试", cancelButtonText: "取消" }); }
  catch { return; }
  retrying.value = item.id;
  try { await apiFetch(`/queue/retry/${encodeURIComponent(item.queue_job_id)}`, { method: "POST" }); ElMessage.success("任务已重新入队"); await load(true); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "重试失败"); }
  finally { retrying.value = ""; }
}
function formatTime(value: string | null) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-"; }
function canRetry(item: PushLedgerItem) { return Boolean(item.queue_job_id && ["Failed", "DeadLetter", "Cancelled"].includes(item.status)); }
</script>

<template>
  <div v-loading="loading" class="ledger">
    <header><ElText type="primary">Push Ledger</ElText><h1>推送台账</h1><p>审计每次推送的内容、渠道、状态、重试与错误信息。</p></header>
    <div class="stats"><ElCard v-for="item in [{label:'台账总数',value:stats.total},{label:'推送成功',value:stats.success},{label:'待处理/重试',value:stats.pending},{label:'失败/死信',value:stats.failed}]" :key="item.label" shadow="never"><small>{{ item.label }}</small><strong>{{ item.value }}</strong></ElCard></div>
    <ElCard shadow="never">
      <div class="filters"><ElInput v-model="filter.q" clearable placeholder="搜索标题、内容、目标、业务 ID 或错误" aria-label="搜索台账" @keyup.enter="search" /><ElSelect v-model="filter.status" clearable placeholder="全部状态" aria-label="状态筛选"><ElOption v-for="status in statusOptions" :key="status" :label="statusLabels[status]" :value="status" /></ElSelect><ElSelect v-model="filter.channelType" clearable placeholder="全部渠道" aria-label="渠道筛选"><ElOption v-for="type in channelTypes" :key="type" :label="type" :value="type" /></ElSelect><ElButton type="primary" @click="search">筛选</ElButton><ElButton @click="reset">重置</ElButton></div>
    </ElCard>
    <ElCard shadow="never"><template #header><div><b>推送记录</b><small>共 {{ total }} 条匹配记录</small></div></template>
      <ElEmpty v-if="!items.length" description="暂无推送台账" />
      <div v-else class="records"><article v-for="item in items" :key="item.id">
        <div class="main"><div class="title"><h3>{{ item.title }}</h3><ElTag :type="statusTypes[item.status] || 'info'">{{ statusLabels[item.status] || item.status }}</ElTag><ElTag type="info">{{ item.channel_name }} / {{ item.channel_type }}</ElTag></div><pre>{{ item.content }}</pre><ElAlert v-if="item.error" :title="`错误：${item.error}`" type="error" :closable="false" /><ElButton v-if="canRetry(item)" type="danger" plain :loading="retrying === item.id" @click="retry(item)">重试此任务</ElButton></div>
        <dl><div><dt>目标</dt><dd>{{ item.target || '-' }}</dd></div><div><dt>业务</dt><dd>{{ item.business_type || '-' }} / {{ item.business_id || '-' }}</dd></div><div><dt>创建 / 排队</dt><dd>{{ formatTime(item.created_at) }}<br>{{ formatTime(item.queued_at) }}</dd></div><div><dt>开始 / 成功</dt><dd>{{ formatTime(item.started_at) }}<br>{{ formatTime(item.sent_at) }}</dd></div><div><dt>失败 / 最后重试</dt><dd>{{ formatTime(item.failed_at) }}<br>{{ formatTime(item.last_retry_at) }}</dd></div><div><dt>尝试 / 重试 / 耗时</dt><dd>{{ item.attempt_count }} / {{ item.retry_count }} / {{ item.duration_ms == null ? '-' : `${item.duration_ms}ms` }}</dd></div></dl>
      </article></div>
      <div class="pagination"><ElPagination background :current-page="page" :page-size="pageSize" :page-sizes="[10,20,50,100]" layout="total, sizes, prev, pager, next" :total="total" @update:current-page="changePage" @update:page-size="changeSize" /></div>
    </ElCard>
  </div>
</template>

<style scoped>
.ledger{min-width:0;display:grid;gap:22px}header h1,header p{margin:4px 0 0}header p{color:var(--el-text-color-secondary)}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.stats :deep(.el-card__body){display:grid;gap:8px}.stats strong{font-size:28px}.stats small{color:var(--el-text-color-secondary)}.filters{display:grid;grid-template-columns:minmax(220px,1fr) 170px 170px auto auto;gap:10px}.el-card small{display:block;margin-top:4px;color:var(--el-text-color-secondary)}.records{display:grid}.records article{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:18px;padding:18px 0;border-bottom:1px solid var(--el-border-color-lighter)}.main{min-width:0;display:grid;justify-items:start;gap:10px}.title{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.title h3{margin:0;font-size:16px}.main pre{box-sizing:border-box;width:100%;margin:0;padding:12px;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:13px;border-radius:8px;background:var(--el-fill-color-light)}dl{margin:0;padding:12px;border-radius:8px;background:var(--el-fill-color-lighter);font-size:12px}dl div{display:grid;grid-template-columns:105px 1fr;gap:5px;margin-bottom:7px}dt{color:var(--el-text-color-secondary)}dd{margin:0;overflow-wrap:anywhere}.pagination{display:flex;justify-content:flex-end;padding-top:18px}@media(max-width:900px){.filters{grid-template-columns:1fr 1fr}.filters>:first-child{grid-column:1/-1}.records article{grid-template-columns:1fr}}@media(max-width:600px){.stats,.filters{grid-template-columns:1fr 1fr}.filters>*:first-child{grid-column:1/-1}.pagination{overflow:auto;justify-content:flex-start}}
</style>
