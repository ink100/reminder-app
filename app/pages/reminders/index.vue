<script setup lang="ts">
import type { ReminderItem } from "@/app/components/reminders/reminder";
definePageMeta({ layout: "default", middleware: "auth" });
const { apiFetch } = useApi();
const { data, error, refresh } = await useAsyncData("reminders", () => apiFetch<{ items: ReminderItem[] }>("/api/reminders"));
watch(error, value => { if (value) ElMessage.error(value.message || "提醒加载失败"); }, { immediate: true });
</script>
<template><ReminderDashboard :items="data?.items || []" @refresh="refresh" /></template>
