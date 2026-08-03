<script setup lang="ts">
definePageMeta({ layout: "default", middleware: ["auth", "admin"] });
const { actor } = useAuth();
const isAdmin = computed(() => actor.value?.role === "ADMIN");
</script>

<template>
  <PushLedgerDashboard v-if="isAdmin" />
  <ElResult v-else icon="warning" title="需要管理员权限" sub-title="推送台账仅向 ADMIN 展示；服务端仍会独立校验每个请求。">
    <template #extra><ElButton type="primary" @click="navigateTo('/')">返回首页</ElButton></template>
  </ElResult>
</template>
