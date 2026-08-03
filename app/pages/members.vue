<script setup lang="ts">
definePageMeta({ layout: "default", middleware: ["auth", "admin"] });

const { actor } = useAuth();
const isAdmin = computed(() => actor.value?.role === "ADMIN");
</script>

<template>
  <div class="members-page">
    <header><el-text type="info">管理员</el-text><h1>成员管理</h1><p>邀请成员并管理角色、状态和访问会话。</p></header>
    <MemberManagement v-if="isAdmin && actor" :actor-id="actor.userId" />
    <el-result v-else icon="warning" title="需要管理员权限" sub-title="此界面仅向 ADMIN 展示；服务端仍会独立校验每个请求。">
      <template #extra><el-button type="primary" @click="navigateTo('/')">返回首页</el-button></template>
    </el-result>
  </div>
</template>

<style scoped>
.members-page { min-width: 0; display: grid; gap: 24px; }
h1, p { margin: 0; }
h1 { margin-top: 4px; font-size: 28px; }
header p { margin-top: 6px; color: var(--el-text-color-secondary); }
</style>
