<script setup lang="ts">
import type { NotificationApiKey, NotificationChannel, NotificationGroup, NotificationRoute, NotificationTemplate } from "./types";

const { apiFetch } = useApi();
const loading = ref(false);
const busy = ref(false);
const groups = ref<NotificationGroup[]>([]);
const channels = ref<NotificationChannel[]>([]);
const templates = ref<NotificationTemplate[]>([]);
const apiKeys = ref<NotificationApiKey[]>([]);
const routes = ref<NotificationRoute[]>([]);
const notifications = ref<Array<{ id: string; title: string; status: string; created_at: string; group?: { name?: string } }>>([]);
const jobs = ref<Array<{ status: string }>>([]);
const selectedGroupId = ref("");
const newKey = ref("");
const keyType = ref<"worker" | "ai">("worker");
const groupDraft = reactive({ name: "", description: "" });
const channelDraft = reactive({ name: "", type: "Telegram", configText: "", enabled: true, isDefault: false });
type TemplateDraft = { id: string | null; name: string; channelType: string; groupId: string; content: string; enabled: boolean; isDefault: boolean };
const blankTemplate = (): TemplateDraft => ({ id: null, name: "", channelType: "Telegram", groupId: "", content: "**{{title}}**\n\n{{summary}}\n\n事件：{{event_type}}\n来源：{{source}}", enabled: true, isDefault: false });
const templateDraft = reactive<TemplateDraft>(blankTemplate());
type RouteDraft = { mode: "inherit" | "custom" | "disabled"; templateId: string; configText: string };
const routeDrafts = reactive<Record<string, RouteDraft>>({});

const selectedGroup = computed(() => groups.value.find(item => item.id === selectedGroupId.value) || null);
const stats = computed(() => ({
  notifications: notifications.value.length,
  pending: jobs.value.filter(item => ["Pending", "RetryWaiting", "Processing"].includes(item.status)).length,
  failed: jobs.value.filter(item => ["Failed", "DeadLetter"].includes(item.status)).length,
  channels: channels.value.filter(item => item.enabled).length,
}));

async function load() {
  loading.value = true;
  try {
    const [groupData, channelData, templateData, keyData, notificationData, jobData] = await Promise.all([
      apiFetch<{ items: NotificationGroup[] }>("/api/notification-center/groups"),
      apiFetch<{ items: NotificationChannel[] }>("/api/notification-center/channels"),
      apiFetch<{ items: NotificationTemplate[] }>("/api/notification-center/templates"),
      apiFetch<{ items: NotificationApiKey[] }>("/api/notification-center/api-keys"),
      apiFetch<{ items: typeof notifications.value }>("/notifications?limit=20"),
      apiFetch<{ items: typeof jobs.value }>("/queue/jobs?limit=200"),
    ]);
    groups.value = groupData.items;
    channels.value = channelData.items;
    templates.value = templateData.items;
    apiKeys.value = keyData.items;
    notifications.value = notificationData.items;
    jobs.value = jobData.items;
    if (!groups.value.some(item => item.id === selectedGroupId.value)) selectedGroupId.value = groups.value[0]?.id || "";
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "通知中心加载失败"); }
  finally { loading.value = false; }
}
onMounted(load);

async function run(action: () => Promise<unknown>, success: string, refresh = true) {
  if (busy.value) return;
  busy.value = true;
  try { await action(); ElMessage.success(success); if (refresh) await load(); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "操作失败"); }
  finally { busy.value = false; }
}
async function confirmDanger(message: string, title: string) {
  try { await ElMessageBox.confirm(message, title, { type: "warning", confirmButtonText: "确认执行", cancelButtonText: "取消" }); return true; }
  catch { return false; }
}
function parseObject(text: string, label: string) {
  if (!text.trim()) return undefined;
  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}必须是 JSON 对象`);
  return value as Record<string, unknown>;
}
async function createGroup() {
  await run(() => apiFetch("/api/notification-center/groups", { method: "POST", body: { name: groupDraft.name, description: groupDraft.description, enabled: true } }), "分组已创建");
  groupDraft.name = ""; groupDraft.description = "";
}
async function toggleGroup(group: NotificationGroup) {
  if (group.enabled && !await confirmDanger(`停用“${group.name}”后，该分组将不再发送通知。`, "停用通知分组")) return;
  await run(() => apiFetch(`/api/notification-center/groups/${group.id}`, { method: "PATCH", body: { enabled: !group.enabled } }), group.enabled ? "分组已停用" : "分组已启用");
}
async function createChannel() {
  await run(async () => {
    const config = parseObject(channelDraft.configText, "渠道配置");
    await apiFetch("/api/notification-center/channels", { method: "POST", body: { type: channelDraft.type, name: channelDraft.name, config: config || {}, enabled: channelDraft.enabled, is_default: channelDraft.isDefault } });
  }, "渠道已创建");
  channelDraft.name = ""; channelDraft.configText = ""; channelDraft.isDefault = false;
}
function routeKey(groupId: string, channelId: string) { return `${groupId}:${channelId}`; }
function currentRoute(groupId: string, channelId: string) { return routes.value.find(item => item.groupId === groupId && item.channelId === channelId); }
function routeDraft(groupId: string, channel: NotificationChannel) {
  const key = routeKey(groupId, channel.id);
  if (!routeDrafts[key]) { const route = currentRoute(groupId, channel.id); routeDrafts[key] = { mode: route?.mode || "inherit", templateId: route?.templateId || "", configText: "" }; }
  return routeDrafts[key];
}
async function saveRoute(group: NotificationGroup, channel: NotificationChannel) {
  const draft = routeDraft(group.id, channel);
  if (draft.mode === "disabled" && !await confirmDanger(`明确禁用“${group.name} / ${channel.name}”后不会回退到默认渠道。`, "禁用分组路由")) return;
  if (draft.mode === "inherit") {
    await run(async () => { await apiFetch(`/api/notification-center/groups/${group.id}/routes/${channel.id}`, { method: "DELETE" }); routes.value = routes.value.filter(item => !(item.groupId === group.id && item.channelId === channel.id)); }, "已恢复继承默认配置", false);
    return;
  }
  await run(async () => {
    const configOverride = parseObject(draft.configText, "渠道覆盖配置");
    const response = await apiFetch<{ item: NotificationRoute }>(`/api/notification-center/groups/${group.id}/routes/${channel.id}`, { method: "PUT", body: { mode: draft.mode, templateId: draft.mode === "custom" ? draft.templateId || null : null, ...(configOverride ? { configOverride } : {}) } });
    routes.value = [...routes.value.filter(item => !(item.groupId === group.id && item.channelId === channel.id)), response.item];
    draft.configText = "";
  }, "路由配置已保存", false);
}
function editTemplate(item: NotificationTemplate) { Object.assign(templateDraft, { id: item.id, name: item.name, channelType: item.channelType, groupId: item.groupId || "", content: item.content, enabled: item.enabled, isDefault: item.isDefault }); }
function resetTemplate() { Object.assign(templateDraft, blankTemplate()); }
async function saveTemplate() {
  const body = { name: templateDraft.name, channel_type: templateDraft.channelType, content: templateDraft.content, enabled: templateDraft.enabled, group_id: templateDraft.groupId || null, is_default: templateDraft.groupId ? false : templateDraft.isDefault };
  await run(() => templateDraft.id ? apiFetch(`/api/notification-center/templates/${templateDraft.id}`, { method: "PATCH", body }) : apiFetch("/api/notification-center/templates", { method: "POST", body }), templateDraft.id ? "模板已更新；已入队任务仍使用内容快照" : "模板已创建");
  resetTemplate();
}
async function createKey() {
  await run(async () => {
    const response = await apiFetch<{ item: NotificationApiKey }>("/api/notification-center/api-keys", { method: "POST", body: { name: keyType.value === "ai" ? "AI Key" : "Worker Key", type: keyType.value } });
    newKey.value = response.item.apiKey;
    apiKeys.value = [response.item, ...apiKeys.value];
  }, "API Key 已创建", false);
}
async function dispatch() {
  if (!await confirmDanger("将立即处理当前队列并执行数据清理，是否继续？", "手动派发队列")) return;
  await run(() => apiFetch("/api/notification-center/dispatch", { method: "POST", body: {} }), "已触发一次队列派发");
}
function scopeLabel(item: NotificationApiKey) { return item.scopes?.includes("ai:all") ? "AI 全模块" : "Worker"; }
function scopeText(item: NotificationApiKey) { return (item.scopes || ["notifications:send"]).join(", "); }
</script>

<template>
  <div v-loading="loading" class="notification-center">
    <header class="page-head"><div><ElText type="primary">Notification Center</ElText><h1>通知管理</h1><p>管理渠道、分组路由、模板和访问密钥。</p></div><ElButton type="primary" :loading="busy" @click="dispatch">手动派发队列</ElButton></header>
    <div class="stats"><ElCard v-for="item in [{label:'最近通知',value:stats.notifications},{label:'待处理/重试',value:stats.pending},{label:'失败/死信',value:stats.failed},{label:'启用渠道',value:stats.channels}]" :key="item.label" shadow="never"><small>{{ item.label }}</small><strong>{{ item.value }}</strong></ElCard></div>

    <ElTabs type="border-card">
      <ElTabPane label="分组路由">
        <div class="section-head"><div><h2>分组路由</h2><p>无覆盖时继承默认配置；明确禁用后不会回退。</p></div><ElSelect v-model="selectedGroupId" placeholder="选择分组"><ElOption v-for="group in groups" :key="group.id" :label="`${group.name}${group.enabled ? '' : '（已停用）'}`" :value="group.id" /></ElSelect></div>
        <template v-if="selectedGroup">
          <div class="group-summary"><div><b>{{ selectedGroup.name }}</b><span>{{ selectedGroup.description || "无说明" }}</span></div><ElButton :type="selectedGroup.enabled ? 'danger' : 'success'" plain @click="toggleGroup(selectedGroup)">{{ selectedGroup.enabled ? "停用分组" : "启用分组" }}</ElButton></div>
          <div class="route-list"><ElCard v-for="channel in channels" :key="channel.id" shadow="never">
            <div class="channel-head"><div><b>{{ channel.name }}</b><ElTag>{{ channel.type }}</ElTag><ElTag v-if="channel.isDefault" type="primary">默认渠道</ElTag><ElTag v-if="!channel.enabled" type="danger">全局停用</ElTag></div><ElTag :type="currentRoute(selectedGroup.id, channel.id)?.mode === 'disabled' ? 'danger' : currentRoute(selectedGroup.id, channel.id) ? 'warning' : 'info'">{{ currentRoute(selectedGroup.id, channel.id)?.mode === 'disabled' ? '明确禁用' : currentRoute(selectedGroup.id, channel.id) ? '分组自定义' : channel.isDefault ? '继承默认' : '未配置' }}</ElTag></div>
            <p class="hint">渠道参数：{{ channel.configured ? `已配置（${channel.configKeys?.join('、') || '安全隐藏'}）` : '使用应用全局设置' }}</p>
            <div class="route-form"><ElSelect v-model="routeDraft(selectedGroup.id, channel).mode" aria-label="配置方式"><ElOption label="继承默认" value="inherit" /><ElOption label="分组自定义" value="custom" /><ElOption label="明确禁用" value="disabled" /></ElSelect><ElSelect v-model="routeDraft(selectedGroup.id, channel).templateId" :disabled="routeDraft(selectedGroup.id, channel).mode !== 'custom'" placeholder="继承默认模板" aria-label="消息模板"><ElOption label="继承默认模板" value="" /><ElOption v-for="item in templates.filter(t => t.channelType === channel.type && t.enabled && (!t.groupId || t.groupId === selectedGroup!.id))" :key="item.id" :label="item.name" :value="item.id" /></ElSelect><ElInput v-model="routeDraft(selectedGroup.id, channel).configText" :disabled="routeDraft(selectedGroup.id, channel).mode !== 'custom'" placeholder='渠道参数覆盖 JSON（可选）' aria-label="渠道参数覆盖" /><ElButton type="primary" :loading="busy" @click="saveRoute(selectedGroup!, channel)">保存路由</ElButton></div>
            <p v-if="currentRoute(selectedGroup.id, channel.id)?.configOverrideKeys.length" class="hint">已保存覆盖字段：{{ currentRoute(selectedGroup.id, channel.id)?.configOverrideKeys.join("、") }}。敏感值不回显；留空保存保持原值。</p>
          </ElCard></div>
        </template><ElEmpty v-else description="暂无通知分组" />
        <ElDivider content-position="left">新建分组</ElDivider><div class="inline-form"><ElInput v-model="groupDraft.name" placeholder="分组名称" /><ElInput v-model="groupDraft.description" placeholder="分组说明" /><ElButton :disabled="!groupDraft.name.trim()" @click="createGroup">创建分组</ElButton></div>
      </ElTabPane>

      <ElTabPane label="渠道">
        <h2>通知渠道</h2><div class="cards"><ElCard v-for="item in channels" :key="item.id" shadow="never"><b>{{ item.name }}</b> <ElTag>{{ item.type }}</ElTag> <ElTag v-if="item.isDefault" type="primary">默认</ElTag> <ElTag :type="item.enabled ? 'success' : 'danger'">{{ item.enabled ? '启用' : '停用' }}</ElTag><p class="hint">配置字段：{{ item.configKeys?.join('、') || (item.configured ? '已安全隐藏' : '无') }}</p></ElCard></div>
        <ElDivider content-position="left">新建渠道</ElDivider><div class="form-grid"><ElInput v-model="channelDraft.name" placeholder="渠道名称" /><ElSelect v-model="channelDraft.type"><ElOption label="Telegram" value="Telegram" /><ElOption label="Email" value="Email" /><ElOption label="Webhook" value="Webhook" /></ElSelect><ElInput v-model="channelDraft.configText" type="textarea" :rows="3" placeholder='配置 JSON，例如 {"chatId":"..."}' /><div><ElCheckbox v-model="channelDraft.enabled">启用</ElCheckbox><ElCheckbox v-model="channelDraft.isDefault">设为该类型默认渠道</ElCheckbox></div><ElButton type="primary" :disabled="!channelDraft.name.trim()" @click="createChannel">创建渠道</ElButton></div>
      </ElTabPane>

      <ElTabPane label="模板">
        <div class="template-layout"><div class="cards"><ElCard v-for="item in templates" :key="item.id" shadow="hover" class="clickable" @click="editTemplate(item)"><b>{{ item.name }}</b> <ElTag>{{ item.channelType }}</ElTag> <ElTag v-if="item.isDefault" type="primary">默认</ElTag> <ElTag v-if="item.groupId" type="warning">{{ groups.find(g => g.id === item.groupId)?.name || '分组' }}</ElTag><p class="template-content">{{ item.content }}</p></ElCard></div><ElCard shadow="never"><div class="section-head"><h2>{{ templateDraft.id ? '编辑模板' : '新建模板' }}</h2><ElButton v-if="templateDraft.id" text type="primary" @click="resetTemplate">新建模板</ElButton></div><div class="form-grid"><ElInput v-model="templateDraft.name" placeholder="模板名称" /><ElSelect v-model="templateDraft.channelType" :disabled="!!templateDraft.id"><ElOption label="Telegram" value="Telegram" /><ElOption label="Email" value="Email" /><ElOption label="Webhook" value="Webhook" /></ElSelect><ElSelect v-model="templateDraft.groupId" :disabled="!!templateDraft.id" @change="templateDraft.isDefault = false"><ElOption label="全局共享" value="" /><ElOption v-for="group in groups" :key="group.id" :label="group.name" :value="group.id" /></ElSelect><ElInput v-model="templateDraft.content" type="textarea" :rows="9" placeholder="模板内容" /><div><ElCheckbox v-model="templateDraft.enabled">启用模板</ElCheckbox><ElCheckbox v-model="templateDraft.isDefault" :disabled="!!templateDraft.groupId || !!templateDraft.id">设为渠道默认模板</ElCheckbox></div><p class="hint">变量：title、summary、source、event_type、payload.xxx、json。模板更新不影响已入队内容快照。</p><ElButton type="primary" :disabled="!templateDraft.name.trim() || !templateDraft.content.trim()" @click="saveTemplate">{{ templateDraft.id ? '保存修改' : '创建模板' }}</ElButton></div></ElCard></div>
      </ElTabPane>

      <ElTabPane label="API Keys">
        <ElAlert title="此页仅限受保护的管理员访问，并按既有管理规则完整明文展示已有 Key。Worker 仅有 notifications:send；AI 同时具有 ai:all 与 notifications:send。" type="warning" :closable="false" show-icon />
        <div class="keys"><ElCard v-for="item in apiKeys" :key="item.id" shadow="never"><div><b>{{ item.name }}</b> <ElTag :type="item.scopes?.includes('ai:all') ? 'warning' : 'info'">{{ scopeLabel(item) }}</ElTag> <ElTag :type="item.enabled ? 'success' : 'danger'">{{ item.enabled ? '启用' : '停用' }}</ElTag></div><code>{{ item.apiKey }}</code><small>Scopes: {{ scopeText(item) }}</small></ElCard></div>
        <ElAlert v-if="newKey" class="new-key" title="新生成的 API Key" type="success" :closable="false"><code>{{ newKey }}</code></ElAlert>
        <div class="inline-form key-form"><ElSelect v-model="keyType"><ElOption label="普通 Worker Key" value="worker" /><ElOption label="AI 全模块 Key" value="ai" /></ElSelect><ElButton type="primary" :loading="busy" @click="createKey">生成新 Key</ElButton></div>
      </ElTabPane>
    </ElTabs>

    <ElCard shadow="never"><template #header><b>最近通知</b></template><ElEmpty v-if="!notifications.length" description="暂无通知" /><div v-else class="recent"><div v-for="item in notifications" :key="item.id"><span><b>{{ item.title }}</b><small>{{ item.group?.name || '未分组' }} · {{ new Date(item.created_at).toLocaleString('zh-CN', { hour12: false }) }}</small></span><ElTag>{{ item.status }}</ElTag></div></div></ElCard>
  </div>
</template>

<style scoped>
.notification-center{min-width:0;display:grid;gap:22px}.page-head,.section-head,.channel-head,.group-summary{display:flex;align-items:center;justify-content:space-between;gap:14px}.page-head h1,.page-head p,h2{margin:4px 0 0}.page-head p,.section-head p,.hint{color:var(--el-text-color-secondary);font-size:13px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.stats :deep(.el-card__body){display:grid;gap:8px}.stats strong{font-size:28px}.stats small{color:var(--el-text-color-secondary)}.group-summary{margin:15px 0;padding:12px;border-radius:8px;background:var(--el-fill-color-light)}.group-summary div{display:grid;gap:4px}.group-summary span{font-size:13px;color:var(--el-text-color-secondary)}.route-list,.cards,.keys,.recent{display:grid;gap:10px}.channel-head>div{display:flex;align-items:center;flex-wrap:wrap;gap:7px}.route-form{display:grid;grid-template-columns:160px 1fr 1fr auto;gap:10px}.inline-form{display:grid;grid-template-columns:1fr 2fr auto;gap:10px}.form-grid{display:grid;gap:12px}.template-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,1fr);gap:18px}.clickable{cursor:pointer}.template-content{overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;white-space:pre-wrap;font-size:12px;color:var(--el-text-color-secondary)}.keys{margin-top:14px}.keys :deep(.el-card__body){display:grid;gap:8px}.keys code,.new-key code{overflow-wrap:anywhere;color:var(--el-color-primary)}.keys small{color:var(--el-text-color-secondary)}.key-form{margin-top:14px;grid-template-columns:240px auto;justify-content:start}.new-key{margin-top:12px}.recent>div{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--el-border-color-lighter)}.recent span{display:grid;gap:4px}.recent small{color:var(--el-text-color-secondary)}@media(max-width:900px){.stats{grid-template-columns:1fr 1fr}.route-form,.inline-form{grid-template-columns:1fr 1fr}.route-form>*:nth-child(3),.inline-form>*:nth-child(2){grid-column:1/-1}.template-layout{grid-template-columns:1fr}.page-head{align-items:flex-start}}@media(max-width:600px){.page-head,.section-head,.channel-head{align-items:stretch;flex-direction:column}.stats,.route-form,.inline-form{grid-template-columns:1fr}.route-form>*,.inline-form>*{grid-column:auto!important}.key-form{grid-template-columns:1fr}}
</style>
