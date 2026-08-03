<script setup lang="ts">
import type { Medicine } from "@/app/components/medicines/medicine";
definePageMeta({ layout: "default", middleware: "auth" });
const { apiFetch } = useApi();
const { data, error } = await useAsyncData("medicines", () => apiFetch<{ items: Medicine[] }>("/api/medicines"));
watch(error, value => { if (value) ElMessage.error(value.message || "药品加载失败"); }, { immediate: true });
</script>
<template><MedicineDashboard :initial-items="data?.items || []"/></template>
