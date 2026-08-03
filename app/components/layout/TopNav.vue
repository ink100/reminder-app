<script setup lang="ts">
const { actor, logout } = useAuth();
const loggingOut = ref(false);

async function handleLogout() {
  if (loggingOut.value) return;
  loggingOut.value = true;
  try {
    await logout();
  } finally {
    loggingOut.value = false;
  }
}
</script>

<template>
  <ElHeader class="top-nav">
    <div class="actor">
      <strong>{{ actor?.displayName || "用户" }}</strong>
      <span>{{ actor?.role === "ADMIN" ? "管理员" : "成员" }}</span>
    </div>
    <div class="actions">
      <NuxtLink class="account-link" to="/account">账户</NuxtLink>
      <ElButton
        type="danger"
        text
        :loading="loggingOut"
        aria-label="退出登录（撤销当前登录设备）"
        @click="handleLogout"
      >
        退出登录
      </ElButton>
    </div>
  </ElHeader>
</template>

<style scoped>
.top-nav { height: auto; min-height: 64px; padding: 10px 4px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.actor { min-width: 0; display: flex; flex-direction: column; }
.actor strong { overflow: hidden; color: #334155; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.actor span { color: #94a3b8; font-size: 12px; }
.actions { display: flex; align-items: center; gap: 4px; }
.account-link { min-height: 40px; padding: 10px 12px; border-radius: 8px; color: #475569; font-size: 14px; text-decoration: none; }
.account-link:hover { background: #f1f5f9; }
</style>
