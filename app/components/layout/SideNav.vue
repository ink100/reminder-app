<script setup lang="ts">
import { navigationIcons } from "./navigationIcons";

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
      <div class="brand-mark" aria-hidden="true">R</div>
      <div>
        <span>REMINDER APP</span>
        <strong>到期提醒</strong>
      </div>
    </div>
    <ElMenu class="menu" :default-active="route.path" @select="selectItem">
      <ElMenuItem v-for="item in items" :key="item.href" :index="item.href">
        <ElIcon><component :is="navigationIcons[item.icon]" /></ElIcon>
        <span>{{ item.label }}</span>
      </ElMenuItem>
    </ElMenu>
    <ElButton class="logout" type="danger" plain :loading="loggingOut" @click="handleLogout">
      退出登录
    </ElButton>
  </ElAside>
</template>

<style scoped>
.side-nav { position: sticky; top: 24px; display: flex; height: calc(100dvh - 48px); flex-direction: column; overflow: hidden; border: 1px solid #e2e8f0; border-radius: 18px; background: rgb(255 255 255 / 96%); box-shadow: 0 12px 32px rgb(15 23 42 / 7%); }
.brand { padding: 22px 20px 14px; display: flex; align-items: center; gap: 12px; }
.brand-mark { display: grid; width: 40px; height: 40px; flex: 0 0 auto; place-items: center; border-radius: 12px; background: linear-gradient(145deg, #2563eb, #1d4ed8); color: white; font-size: 18px; font-weight: 800; box-shadow: 0 8px 18px rgb(37 99 235 / 22%); }
.brand > div:last-child { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.brand span { color: #94a3b8; font-size: 10px; font-weight: 700; letter-spacing: .08em; }
.brand strong { color: #0f172a; font-size: 17px; }
.menu { flex: 1; overflow-y: auto; border-right: 0; padding: 8px 12px; scrollbar-width: thin; }
.menu :deep(.el-menu-item) { height: 44px; margin-bottom: 3px; gap: 4px; border-radius: 10px; color: #526176; }
.menu :deep(.el-menu-item:hover) { background: #f1f5f9; color: #0f172a; }
.menu :deep(.el-menu-item.is-active) { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; box-shadow: 0 6px 14px rgb(37 99 235 / 18%); }
.menu :deep(.el-icon) { font-size: 17px; }
.logout { min-height: 44px; margin: 16px; }
@media (max-width: 767px) { .side-nav { display: none; } }
</style>
