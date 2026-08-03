<script setup lang="ts">
type TodoItem = { id: string; title: string; completedAt: string | null; createdAt: string };
definePageMeta({ layout: "default", middleware: "auth" });
const { apiFetch } = useApi();
const { data, error } = await useAsyncData("todos", () => apiFetch<{ items: TodoItem[] }>("/api/todos"));
watch(error, value => { if (value) ElMessage.error(value.message || "待办加载失败"); }, { immediate: true });
</script>
<template><TodoList :initial-todos="data?.items || []" /></template>
