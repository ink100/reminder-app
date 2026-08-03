<script setup lang="ts">
definePageMeta({ layout: "public" });
const route = useRoute();
const rawToken = Array.isArray(route.params.token) ? route.params.token[0] : route.params.token;
const token = typeof rawToken === "string" ? rawToken : "";
</script>

<template>
  <main class="invite-page">
    <ElCard v-if="token" shadow="always" class="invite-card">
      <p class="eyebrow">家庭成员邀请</p>
      <h1>欢迎加入到期提醒系统</h1>
      <p class="description">请选择一种独立的首次登录方式。激活后即可进入系统。</p>
      <InvitationEnrollment :token="token" />
    </ElCard>
    <ElCard v-else shadow="never" class="invalid-card">
      <ElResult icon="error" title="邀请无效或已过期" sub-title="请联系管理员获取新的邀请。" />
    </ElCard>
  </main>
</template>

<style scoped>
.invite-page { min-height: 100dvh; display: grid; place-items: center; padding: 20px; background: var(--el-fill-color-light); }
.invite-card, .invalid-card { width: min(100%, 500px); border-radius: 18px; }
.eyebrow { margin: 0; color: var(--el-text-color-secondary); font-size: 13px; }
h1 { margin: 6px 0 8px; font-size: 26px; }
.description { margin: 0 0 26px; color: var(--el-text-color-secondary); line-height: 1.6; }
</style>
