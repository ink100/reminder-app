<script setup lang="ts">
import type { ReminderItem } from "@/app/components/reminders/reminder";
type Attachment = { id: string; originalName: string; mimetype: string; size: number; url: string; reminderId?: string | null };
definePageMeta({ layout: "default", middleware: "auth" });
const route = useRoute();
const { apiFetch } = useApi();
const id = computed(() => String(route.params.id));
const { data, error } = await useAsyncData(`reminder-edit-${id.value}`, async () => {
  const [reminder, attachmentPage] = await Promise.all([
    apiFetch<{ item: ReminderItem }>(`/api/reminders/${id.value}`),
    apiFetch<{ items: Attachment[] }>("/api/attachments?page=1&pageSize=100"),
  ]);
  return { item: reminder.item, attachments: attachmentPage.items.filter(item => item.reminderId === id.value) };
});
if (error.value && (error.value as { statusCode?: number }).statusCode === 404) throw createError({ statusCode: 404, statusMessage: "提醒不存在" });
</script>
<template><section v-if="data" class="form-page"><header><p>编辑提醒</p><h1>更新提醒事项</h1></header><ReminderForm mode="edit" :reminder="data.item" :attachments="data.attachments" /></section></template>
<style scoped>.form-page{display:grid;gap:20px;max-width:920px;margin:auto}.form-page p,.form-page h1{margin:0}.form-page p{color:#64748b;font-size:14px}.form-page h1{font-size:24px}</style>
