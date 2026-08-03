<script setup lang="ts">
import type { Medicine, MedicineAttachment } from "@/app/components/medicines/medicine";
definePageMeta({ layout: "default", middleware: "auth" });
const route = useRoute(); const { apiFetch } = useApi(); const id = String(route.params.id);
const { data, error } = await useAsyncData(`medicine-${id}`, async () => { const [medicine, files] = await Promise.all([apiFetch<{item:Medicine}>(`/api/medicines/${id}`), apiFetch<{items:MedicineAttachment[]}>(`/api/medicines/${id}/attachments`)]); return { medicine: medicine.item, attachments: files.items }; });
watch(error, value => { if (value) ElMessage.error(value.message || "药品明细加载失败"); }, { immediate: true });
</script>
<template><MedicineDetail v-if="data" :medicine="data.medicine" :initial-attachments="data.attachments"/><ElEmpty v-else description="药品明细加载失败"/></template>
