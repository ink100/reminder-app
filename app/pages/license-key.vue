<script setup lang="ts">
definePageMeta({ layout: "default", middleware: ["auth", "admin"] });
const route = useRoute();
const reminderId = computed(() => typeof route.query.reminderId === "string" ? route.query.reminderId.trim() : "");
const validDays = computed(() => typeof route.query.validDays === "string" ? route.query.validDays : "7");
const initialClientKey = ref("");
const linkedReminderId = ref("");
const { apiFetch } = useApi();
onMounted(async () => {
  if (!reminderId.value) return;
  try {
    const data = await apiFetch<{ item?: { id:string; activationCode?:string|null } }>(`/api/reminders/${encodeURIComponent(reminderId.value)}`);
    if (data.item?.activationCode) { initialClientKey.value = data.item.activationCode; linkedReminderId.value = data.item.id; }
  } catch { /* The generator remains usable when a stale reminder link is supplied. */ }
});
</script>
<template><div class="page"><header><el-text type="info">授权工具</el-text><h1>生成激活密匙文件</h1><p>输入激活码 / Client Key 和有效天数，生成 HRB 授权 .key 文件。</p></header><LicenseGenerator :key="linkedReminderId || 'standalone'" :initial-client-key="initialClientKey" :reminder-id="linkedReminderId" :initial-valid-days="validDays"/><StoreAccountManager /></div></template>
<style scoped>.page{display:grid;gap:24px;min-width:0}h1,p{margin:4px 0}h1{font-size:28px}header p{color:var(--el-text-color-secondary)}</style>
