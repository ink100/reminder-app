<script setup lang="ts">
import { REMINDER_GROUPS, formatDateTime, reminderGroup, riskLevel, type ReminderItem, type RiskLevel } from "./reminder";

const props = defineProps<{ items: ReminderItem[] }>();
const emit = defineEmits<{ refresh: [] }>();
const route = useRoute();
const router = useRouter();
const { apiFetch } = useApi();
type View = "active" | "completed" | "deleted";
type Status = "all" | "warning" | "urgent" | "overdue";
type Priority = "all" | "high" | "medium" | "low";
const scalar = (value: unknown) => typeof value === "string" ? value : "";
const valid = <T extends string>(value: string, values: readonly T[], fallback: T) => values.includes(value as T) ? value as T : fallback;
const view = ref<View>(valid(scalar(route.query.view), ["active", "completed", "deleted"], "active"));
const search = ref(scalar(route.query.search));
const status = ref<Status>(valid(scalar(route.query.status), ["all", "warning", "urgent", "overdue"], "all"));
const priority = ref<Priority>(valid(scalar(route.query.priority), ["all", "high", "medium", "low"], "all"));
const group = ref(valid(scalar(route.query.group), ["all", ...REMINDER_GROUPS], "all"));
const collapsed = ref(new Set<string>());
const busy = ref(new Set<string>());

const active = computed(() => props.items.filter(item => !item.deletedAt && !item.completedAt));
const completed = computed(() => props.items.filter(item => !item.deletedAt && item.completedAt));
const deleted = computed(() => props.items.filter(item => item.deletedAt));
const stats = computed(() => {
  const result = { total: active.value.length, warning: 0, urgent: 0, overdue: 0 };
  for (const item of active.value) {
    const level = riskLevel(item);
    if (level === "warning" || level === "urgent" || level === "overdue") result[level]++;
  }
  return result;
});
const filtered = computed(() => active.value.filter(item => {
  const term = search.value.trim().toLowerCase();
  const haystack = [item.title, item.description, item.category, item.activationContact].filter(Boolean).join(" ").toLowerCase();
  return (!term || haystack.includes(term))
    && (status.value === "all" || riskLevel(item) === status.value)
    && (priority.value === "all" || item.priority === priority.value)
    && (group.value === "all" || reminderGroup(item.category) === group.value);
}));
const displayed = computed(() => view.value === "active" ? filtered.value : view.value === "completed" ? completed.value : deleted.value);
const grouped = computed(() => REMINDER_GROUPS.map(name => ({ name, items: displayed.value.filter(item => reminderGroup(item.category) === name) })).filter(section => section.items.length));
const riskLabels: Record<RiskLevel, string> = { normal: "正常", warning: "即将到期", urgent: "24h 内", overdue: "已超期", completed: "已完成" };
const priorityLabels = { high: "高", medium: "中", low: "低" };

watch([view, search, status, priority, group], () => {
  const query: Record<string, string> = {};
  if (view.value !== "active") query.view = view.value;
  if (search.value) query.search = search.value;
  if (status.value !== "all") query.status = status.value;
  if (priority.value !== "all") query.priority = priority.value;
  if (group.value !== "all") query.group = group.value;
  router.replace({ query });
}, { flush: "post" });

function returnQuery() { return { returnTo: route.fullPath }; }
function toggleGroup(name: string) {
  const next = new Set(collapsed.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  collapsed.value = next;
}
async function run(id: string, action: "complete" | "restore" | "delete") {
  if (busy.value.has(id)) return;
  if (action === "delete") {
    try { await ElMessageBox.confirm("删除后可在已删除记录中查看。", "删除提醒", { type: "warning", confirmButtonText: "删除" }); }
    catch { return; }
  }
  busy.value.add(id);
  try {
    const url = action === "delete" ? `/api/reminders/${id}` : `/api/reminders/${id}/${action}`;
    await apiFetch(url, { method: action === "delete" ? "DELETE" : "POST", body: action === "complete" ? {} : undefined });
    ElMessage.success(action === "complete" ? "已完成" : action === "restore" ? "已恢复" : "已删除");
    emit("refresh");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "操作失败");
  } finally { busy.value.delete(id); }
}
</script>

<template>
  <section class="dashboard">
    <header class="page-head">
      <div><p>提醒中心</p><h1>别超期 · 首页概览</h1></div>
      <ElSegmented
        v-model="view"
        :options="[
        { label: `提醒记录（${active.length}）`, value: 'active' },
        { label: `已完成记录（${completed.length}）`, value: 'completed' },
        { label: `已删除记录（${deleted.length}）`, value: 'deleted' }
      ]"
        aria-label="提醒记录视图"
      />
    </header>

    <template v-if="view === 'active'">
      <div class="stats">
        <button v-for="card in [{key:'all',label:'全部事项',value:stats.total},{key:'warning',label:'即将到期',value:stats.warning},{key:'urgent',label:'24h 内',value:stats.urgent},{key:'overdue',label:'已超期',value:stats.overdue}]" :key="card.key" type="button" :class="{ selected: status === card.key }" @click="status = card.key as Status">
          <span>{{ card.label }}</span><strong>{{ card.value }}</strong>
        </button>
      </div>
      <div class="filters">
        <ElInput v-model="search" clearable placeholder="搜索标题或标签..." aria-label="搜索提醒" />
        <ElSelect v-model="status" aria-label="状态筛选"><ElOption label="全部状态" value="all" /><ElOption label="即将到期" value="warning" /><ElOption label="24 小时内" value="urgent" /><ElOption label="已超期" value="overdue" /></ElSelect>
        <ElSelect v-model="priority" aria-label="优先级筛选"><ElOption label="全部优先级" value="all" /><ElOption label="高" value="high" /><ElOption label="中" value="medium" /><ElOption label="低" value="low" /></ElSelect>
        <ElSelect v-model="group" aria-label="分组筛选"><ElOption label="全部分组" value="all" /><ElOption v-for="item in REMINDER_GROUPS" :key="item" :label="item" :value="item" /></ElSelect>
        <NuxtLink :to="{ path: '/reminders/new', query: returnQuery() }"><ElButton type="primary">新增提醒</ElButton></NuxtLink>
      </div>
    </template>

    <ElEmpty v-if="!displayed.length" :description="view === 'active' ? '当前筛选条件下没有提醒事项。' : view === 'completed' ? '暂无已完成的提醒记录。' : '暂无已删除的提醒记录。'" />
    <div v-else class="groups">
      <section v-for="section in grouped" :key="section.name" class="group">
        <button class="group-head" type="button" :aria-expanded="!collapsed.has(section.name)" @click="toggleGroup(section.name)">
          <span>{{ collapsed.has(section.name) ? '›' : '⌄' }}</span> {{ section.name }} <ElTag size="small">{{ section.items.length }}</ElTag>
        </button>
        <div v-show="!collapsed.has(section.name)" class="cards">
          <article v-for="item in section.items" :key="item.id" class="card">
            <div class="card-main">
              <div class="title-line"><h3>{{ item.title }}</h3><ElTag size="small" :type="item.activationCode || item.hasActivationCode ? 'primary' : 'info'">{{ item.activationCode || item.hasActivationCode ? '激活码通知' : '普通提醒' }}</ElTag><ElTag size="small" :type="riskLevel(item) === 'overdue' ? 'danger' : riskLevel(item) === 'completed' ? 'success' : 'warning'">{{ item.deletedAt ? '已删除' : riskLabels[riskLevel(item)] }}</ElTag></div>
              <p v-if="item.description" class="description">{{ item.description }}</p>
              <p v-if="item.activationContact" class="contact">联系方式：{{ item.activationContact }}</p>
              <p class="meta">{{ item.category || '未分类' }} · {{ priorityLabels[item.priority] }}</p>
            </div>
            <div class="time"><template v-if="item.completedAt"><b>完成于：{{ formatDateTime(item.completedAt) }}</b><small>原到期：{{ formatDateTime(item.dueAt) }}</small></template><template v-else><span>到期：{{ formatDateTime(item.dueAt) }}</span><small v-if="item.deletedAt">删除于：{{ formatDateTime(item.deletedAt) }}</small></template></div>
            <div v-if="!item.deletedAt" class="actions">
              <NuxtLink :to="{ path: `/reminders/${item.id}/edit`, query: returnQuery() }"><ElButton text aria-label="编辑">编辑</ElButton></NuxtLink>
              <ElButton v-if="item.completedAt" text type="primary" :loading="busy.has(item.id)" aria-label="恢复为未完成" @click="run(item.id, 'restore')">恢复</ElButton>
              <ElButton v-else text type="success" :loading="busy.has(item.id)" aria-label="完成" @click="run(item.id, 'complete')">完成</ElButton>
              <ElButton text type="danger" :loading="busy.has(item.id)" aria-label="删除" @click="run(item.id, 'delete')">删除</ElButton>
            </div>
          </article>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.dashboard{display:grid;gap:22px}.page-head{display:flex;align-items:end;justify-content:space-between;gap:16px}.page-head p,.page-head h1{margin:0}.page-head p{color:#64748b;font-size:14px}.page-head h1{font-size:24px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.stats button{display:grid;gap:5px;padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;text-align:left;cursor:pointer}.stats button.selected{border-color:#2563eb;box-shadow:0 0 0 2px #2563eb20}.stats span{font-size:12px;color:#64748b}.stats strong{font-size:28px}.filters{display:grid;grid-template-columns:minmax(180px,1fr) 150px 150px 170px auto;gap:10px}.groups,.cards{display:grid;gap:12px}.group{display:grid;gap:8px}.group-head{min-height:44px;border:0;background:none;text-align:left;font-weight:600;color:#334155;cursor:pointer}.card{display:flex;align-items:flex-start;gap:16px;padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#fff}.card-main{flex:1;min-width:0}.title-line{display:flex;flex-wrap:wrap;align-items:center;gap:7px}.title-line h3{margin:0;font-size:15px}.description{white-space:pre-wrap;color:#475569;font-size:13px}.meta,.contact{margin:6px 0 0;font-size:12px;color:#94a3b8}.contact{color:#0284c7}.time{display:grid;gap:5px;text-align:right;font-size:12px;color:#64748b}.time b{color:#059669}.time small{color:#94a3b8}.actions{display:flex;gap:2px}@media(max-width:900px){.filters{grid-template-columns:1fr 1fr}.filters>:first-child,.filters>:last-child{grid-column:1/-1}.page-head,.card{flex-direction:column;align-items:stretch}.time{text-align:left}.actions{justify-content:flex-end}}@media(max-width:600px){.stats{grid-template-columns:1fr 1fr}.page-head :deep(.el-segmented){width:100%;overflow:auto}.filters{grid-template-columns:1fr}.filters>*{grid-column:auto!important}}
</style>
