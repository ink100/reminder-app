<script setup lang="ts">
const props = defineProps<{ role?: string | null }>();
const route = useRoute();
const { items } = useNavigation(() => props.role);
const { logout } = useAuth();
const loggingOut = ref(false);

async function selectItem(path: string) {
  await navigateTo(path);
}

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
  <ElAside width="224px" class="side-nav">
    <div class="brand">
      <span>REMINDER APP</span>
      <strong>到期提醒</strong>
    </div>
    <ElMenu class="menu" :default-active="route.path" @select="selectItem">
      <ElMenuItem v-for="item in items" :key="item.href" :index="item.href">
        {{ item.label }}
      </ElMenuItem>
    </ElMenu>
    <ElButton class="logout" type="danger" plain :loading="loggingOut" @click="handleLogout">
      退出登录
    </ElButton>
  </ElAside>
</template>

<style scoped>
.side-nav { display: flex; min-height: calc(100dvh - 48px); flex-direction: column; overflow: hidden; border: 1px solid #e2e8f0; border-radius: 16px; background: white; box-shadow: 0 1px 3px rgb(15 23 42 / 8%); }
.brand { padding: 24px 24px 12px; display: flex; flex-direction: column; gap: 8px; }
.brand span { color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: .08em; }
.brand strong { color: #0f172a; font-size: 18px; }
.menu { flex: 1; border-right: 0; padding: 8px 12px; }
.menu :deep(.el-menu-item) { height: 44px; margin-bottom: 2px; border-radius: 8px; }
.menu :deep(.el-menu-item.is-active) { background: var(--el-color-primary); color: white; }
.logout { min-height: 44px; margin: 16px; }
@media (max-width: 767px) { .side-nav { display: none; } }
</style>
