<script setup lang="ts">
import type { Medicine, MedicineAttachmentType, MedicineStatus } from "./medicine";
import { attachmentSections, categories, dateInput, formatDate, statusLabel, units } from "./medicine";

const props = defineProps<{ initialItems: Medicine[] }>();
const { apiFetch } = useApi();
const items = ref([...props.initialItems]);
const search = ref(""); const category = ref("all"); const status = ref<"all" | MedicineStatus>("all"); const tag = ref("");
const dialog = ref(false); const saving = ref(false); const editingId = ref<string | null>(null);
const blank = () => ({ name: "", category: "其他", tags: "", quantityTotal: null as number | null, quantityRemaining: null as number | null, unit: "盒", lowStockThreshold: null as number | null, locationText: "", contentText: "", openedAt: "", expiresAt: "", expirationReminderDays: 30, notes: "" });
const form = reactive(blank());
const pending = reactive<Record<MedicineAttachmentType, File[]>>({ medicine_photo: [], medicine_location: [], medicine_content: [] });
const stats = computed(() => ({ total: items.value.length, opened: items.value.filter(i => i.openedAt).length, expiring: items.value.filter(i => i.status === "expiring_soon").length, expired: items.value.filter(i => i.status === "expired").length, low: items.value.filter(i => ["low_stock", "empty"].includes(i.status)).length }));
const filtered = computed(() => items.value.filter(item => {
  const word = search.value.trim().toLowerCase(); const tagWord = tag.value.trim().toLowerCase();
  const haystack = [item.name, item.category, item.tags, item.locationText, item.contentText].filter(Boolean).join(" ").toLowerCase();
  return (!word || haystack.includes(word)) && (category.value === "all" || item.category === category.value) && (status.value === "all" || item.status === status.value) && (!tagWord || (item.tags || "").toLowerCase().includes(tagWord));
}));
function clearPending() { for (const section of attachmentSections) pending[section.type] = []; }
function openCreate() { editingId.value = null; Object.assign(form, blank()); clearPending(); dialog.value = true; }
function openEdit(item: Medicine) { editingId.value = item.id; Object.assign(form, { ...item, tags: item.tags || "", locationText: item.locationText || "", contentText: item.contentText || "", notes: item.notes || "", openedAt: dateInput(item.openedAt), expiresAt: dateInput(item.expiresAt) }); clearPending(); dialog.value = true; }
function addFile(type: MedicineAttachmentType, file: File) { if (!file.type.startsWith("image/")) return ElMessage.error("请上传图片附件"); if (file.size > 20 * 1024 * 1024) return ElMessage.error("药品图片不能超过 20MB"); pending[type].push(file); }
async function save() {
  if (!form.name.trim()) return ElMessage.warning("请输入药品名称");
  saving.value = true;
  try {
    const path = editingId.value ? `/api/medicines/${editingId.value}` : "/api/medicines";
    const result = await apiFetch<{ item: Medicine }>(path, { method: editingId.value ? "PUT" : "POST", body: { ...form, openedAt: form.openedAt || null, expiresAt: form.expiresAt || null } });
    const index = items.value.findIndex(i => i.id === result.item.id); if (index < 0) items.value.unshift(result.item); else items.value[index] = result.item;
    let count = 0;
    for (const section of attachmentSections) for (const file of pending[section.type]) { const body = new FormData(); body.append("file", file); body.append("attachmentType", section.type); await apiFetch(`/api/medicines/${result.item.id}/attachments`, { method: "POST", body }); count++; }
    dialog.value = false; clearPending(); ElMessage.success(count ? `药品已保存，并上传了 ${count} 张附件` : "药品已保存，过期提醒已同步");
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "保存失败"); } finally { saving.value = false; }
}
async function remove(item: Medicine) {
  try { await ElMessageBox.confirm(`确定归档药品「${item.name}」吗？`, "归档药品", { type: "warning" }); await apiFetch(`/api/medicines/${item.id}`, { method: "DELETE" }); items.value = items.value.filter(i => i.id !== item.id); ElMessage.success("药品已归档，关联提醒已同步"); }
  catch (error) { if (error !== "cancel" && error !== "close") ElMessage.error(error instanceof Error ? error.message : "归档失败"); }
}
</script>
<template>
  <div class="page">
    <header><div><small>家庭药箱</small><h1>药品管理</h1><p>管理剩余量、位置、附件和过期提醒。</p></div><ElButton type="primary" @click="openCreate">新增药品</ElButton></header>
    <div class="stats"><ElCard v-for="(value,key) in stats" :key="key" shadow="never"><small>{{ {total:'总数',opened:'已开封',expiring:'即将过期',expired:'已过期',low:'库存不足'}[key] }}</small><strong>{{ value }}</strong></ElCard></div>
    <ElCard shadow="never"><div class="filters"><ElInput v-model="search" clearable placeholder="搜索药名/位置/内容"/><ElSelect v-model="category"><ElOption label="全部分类" value="all"/><ElOption v-for="entry in categories" :key="entry" :label="entry" :value="entry"/></ElSelect><ElSelect v-model="status"><ElOption label="全部状态" value="all"/><ElOption v-for="(label,value) in statusLabel" :key="value" :label="label" :value="value"/></ElSelect><ElInput v-model="tag" clearable placeholder="标签筛选"/></div></ElCard>
    <ElEmpty v-if="!filtered.length" description="没有符合条件的药品"/>
    <div class="cards"><ElCard v-for="item in filtered" :key="item.id" shadow="hover"><template #header><div class="card-head"><div><h2>{{ item.name }}</h2><small>{{ item.category }}{{ item.tags ? ` · ${item.tags}` : '' }}</small></div><ElTag>{{ statusLabel[item.status] }}</ElTag></div></template><div class="details"><span>剩余量<br><b>{{ item.quantityRemaining ?? '-' }}{{ item.unit }}</b></span><span>过期日期<br><b>{{ formatDate(item.expiresAt) }}</b></span><span>位置<br><b>{{ item.locationText || '未填写' }}</b></span></div><p v-if="item.contentText">{{ item.contentText }}</p><div class="actions"><NuxtLink :to="`/medicines/${item.id}`"><ElButton type="primary">查看明细</ElButton></NuxtLink><ElButton @click="openEdit(item)">编辑</ElButton><ElButton type="danger" plain @click="remove(item)">归档</ElButton></div></ElCard></div>
    <ElDialog v-model="dialog" :title="editingId ? '编辑药品' : '新增药品'" width="min(900px, 94vw)" destroy-on-close>
      <ElForm label-position="top" @submit.prevent="save"><div class="form-grid"><ElFormItem label="药品名称" required><ElInput v-model="form.name"/></ElFormItem><ElFormItem label="分类"><ElSelect v-model="form.category"><ElOption v-for="entry in categories" :key="entry" :label="entry" :value="entry"/></ElSelect></ElFormItem><ElFormItem label="标签"><ElInput v-model="form.tags" placeholder="退烧,止痛"/></ElFormItem><ElFormItem label="总数量"><ElInputNumber v-model="form.quantityTotal" :min="0"/></ElFormItem><ElFormItem label="剩余量"><ElInputNumber v-model="form.quantityRemaining" :min="0"/></ElFormItem><ElFormItem label="单位"><ElSelect v-model="form.unit"><ElOption v-for="entry in units" :key="entry" :label="entry" :value="entry"/></ElSelect></ElFormItem><ElFormItem label="低库存阈值"><ElInputNumber v-model="form.lowStockThreshold" :min="0"/></ElFormItem><ElFormItem label="开封时间"><ElDatePicker v-model="form.openedAt" type="date" value-format="YYYY-MM-DD"/></ElFormItem><ElFormItem label="过期日期"><ElDatePicker v-model="form.expiresAt" type="date" value-format="YYYY-MM-DD"/></ElFormItem><ElFormItem label="提前提醒天数"><ElInputNumber v-model="form.expirationReminderDays" :min="0" :max="3650"/></ElFormItem><ElFormItem label="存放位置"><ElInput v-model="form.locationText"/></ElFormItem><ElFormItem label="备注"><ElInput v-model="form.notes"/></ElFormItem></div><ElFormItem label="药品内容（文字）"><ElInput v-model="form.contentText" type="textarea" :rows="4"/></ElFormItem>
      <div class="attachments"><div v-for="section in attachmentSections" :key="section.type"><b>{{ section.title }}</b><small>{{ section.description }}</small><FileUpload accept="image/*" multiple :limit-bytes="20*1024*1024" :disabled="saving" @select="addFile(section.type,$event)" @error="ElMessage.error($event)"/><ElTag v-for="(file,index) in pending[section.type]" :key="`${file.name}-${index}`" closable @close="pending[section.type].splice(index,1)">{{ file.name }}</ElTag></div></div>
      </ElForm><template #footer><ElButton @click="dialog=false">取消</ElButton><ElButton type="primary" :loading="saving" @click="save">保存</ElButton></template>
    </ElDialog>
  </div>
</template>
<style scoped>.page{display:grid;gap:20px}header,.card-head,.actions{display:flex;align-items:center;justify-content:space-between;gap:12px}h1,h2,p{margin:0}header p,header small,.card-head small{color:#64748b}.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.stats :deep(.el-card__body){display:grid;gap:6px}.stats strong{font-size:24px}.filters,.form-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.details{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;color:#64748b;margin-bottom:14px}.details b{color:#334155}.actions{justify-content:flex-start;margin-top:16px}.attachments{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.attachments>div{display:grid;gap:8px;border:1px solid #e2e8f0;padding:12px;border-radius:10px}.attachments small{color:#64748b}@media(max-width:800px){.stats{grid-template-columns:repeat(2,1fr)}.filters,.form-grid,.cards,.attachments{grid-template-columns:1fr}header{align-items:flex-start}}</style>
