<script setup lang="ts">
import { ElMessageBox } from "element-plus";
type Kind = "license_payment_qr_wechat" | "license_payment_qr_alipay";
type Item = { id: string; originalName: string; url: string; createdAt: string; attachmentType: Kind };
const props = defineProps<{ accountId: string; shopName: string }>();
const { apiFetch } = useApi();
const endpoint = computed(() => `/api/license/store-accounts/${encodeURIComponent(props.accountId)}/payment-qr`);
const items = reactive<{ wechat: Item | null; alipay: Item | null }>({ wechat: null, alipay: null });
const loading = ref(true); const busy = reactive({ wechat: false, alipay: false }); const message = ref("");
const slots: Array<{ key: "wechat" | "alipay"; type: Kind; label: string }> = [
  { key: "wechat", type: "license_payment_qr_wechat", label: "微信收款码" },
  { key: "alipay", type: "license_payment_qr_alipay", label: "支付宝收款码" },
];
async function load() { loading.value = true; try { const data = await apiFetch<{items: typeof items}>(endpoint.value); Object.assign(items, data.items); message.value = ""; } catch(e) { message.value = e instanceof Error ? e.message : "加载二维码失败"; } finally { loading.value = false; } }
onMounted(load);
async function upload(slot: typeof slots[number], event: Event) {
  const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return;
  busy[slot.key] = true;
  try { const body = new FormData(); body.append("file", file); body.append("attachmentType", slot.type); const data = await apiFetch<{item: Item; cleanupPending?: boolean}>(endpoint.value, { method: "POST", body }); items[slot.key] = data.item; message.value = data.cleanupPending ? "二维码已保存，旧文件暂待清理" : "二维码已上传"; }
  catch(e) { message.value = e instanceof Error ? e.message : "上传失败"; } finally { busy[slot.key] = false; input.value = ""; }
}
async function remove(slot: typeof slots[number]) {
  try { await ElMessageBox.confirm(`确定删除这张${slot.label}吗？`, "删除收款码", { type: "warning" }); } catch { return; }
  busy[slot.key] = true;
  try { const data = await apiFetch<{cleanupPending?: boolean}>(`${endpoint.value}?attachmentType=${encodeURIComponent(slot.type)}`, { method: "DELETE" }); items[slot.key] = null; message.value = data.cleanupPending ? "二维码记录已删除，文件暂待清理" : "二维码已删除"; }
  catch(e) { message.value = e instanceof Error ? e.message : "删除失败"; } finally { busy[slot.key] = false; }
}
</script>
<template>
  <section class="qr"><header><strong>{{ shopName }} · 微信/支付宝二维码截图</strong><el-text type="info">二维码仅关联当前店铺。</el-text></header>
    <el-alert v-if="message" :title="message" type="info" :closable="false" />
    <el-skeleton v-if="loading" :rows="3" animated />
    <div v-else class="grid"><el-card v-for="slot in slots" :key="slot.key" shadow="never"><template #header>{{ slot.label }}</template>
      <a v-if="items[slot.key]" :href="items[slot.key]!.url" target="_blank" rel="noopener noreferrer"><img :src="items[slot.key]!.url" :alt="slot.label"></a><el-empty v-else description="暂未上传" :image-size="60" />
      <p v-if="items[slot.key]" class="filename">{{ items[slot.key]!.originalName }}</p>
      <div class="buttons"><label class="el-button el-button--primary" :class="{ 'is-disabled': busy[slot.key] }">{{ items[slot.key] ? "替换截图" : "上传截图" }}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" :disabled="busy[slot.key]" @change="upload(slot, $event)"></label><el-button v-if="items[slot.key]" type="danger" :loading="busy[slot.key]" @click="remove(slot)">删除截图</el-button></div>
    </el-card></div>
  </section>
</template>
<style scoped>.qr{padding:16px;border:1px solid var(--el-border-color);border-radius:8px;background:var(--el-fill-color-lighter)}header{display:flex;flex-direction:column;gap:4px;margin-bottom:12px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}img{width:100%;aspect-ratio:1;object-fit:contain;background:#fff}.filename{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--el-text-color-secondary)}.buttons{display:flex;gap:8px}.buttons input{display:none}@media(max-width:600px){.grid{grid-template-columns:1fr}.buttons>*{flex:1}}</style>
