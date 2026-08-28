<script setup lang="ts">
import { MoreFilled } from "@element-plus/icons-vue";
import { navigationIcons } from "./navigationIcons";

const props = defineProps<{ role?: string | null }>();
const open = ref(false);
const route = useRoute();
const { items, isActive } = useNavigation(() => props.role);
const primaryItems = computed(() => items.value.slice(0, 4));
const moreItems = computed(() => items.value.slice(4));
const moreActive = computed(() => moreItems.value.some((item) => isActive(item.href)));


watch(() => route.fullPath, () => { open.value = false; });

async function selectItem(path: string) {
  open.value = false;
  await navigateTo(path);
}
</script>

<template>
  <div class="mobile-nav">
    <ElDrawer v-model="open" direction="btt" size="70%" title="更多导航" class="mobile-drawer">
      <ElMenu :default-active="route.path" @select="selectItem">
        <ElMenuItem v-for="item in moreItems" :key="item.href" :index="item.href">
          <ElIcon><component :is="navigationIcons[item.icon]" /></ElIcon>
          <span>{{ item.label }}</span>
        </ElMenuItem>
      </ElMenu>
    </ElDrawer>

    <nav aria-label="主导航" class="mobile-bar">
      <NuxtLink
        v-for="item in primaryItems"
        :key="item.href"
        :to="item.href"
        :aria-current="isActive(item.href) ? 'page' : undefined"
        :class="{ active: isActive(item.href) }"
      >
        <ElIcon><component :is="navigationIcons[item.icon]" /></ElIcon>
        <span>{{ item.shortLabel }}</span>
      </NuxtLink>
      <button
        type="button"
        aria-label="打开更多导航"
        :aria-expanded="open"
        :aria-current="moreActive ? 'page' : undefined"
        :class="{ active: moreActive }"
        @click="open = true"
      >
        <ElIcon><MoreFilled /></ElIcon>
        <span>更多</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.mobile-nav { display: none; }
.mobile-bar { position: fixed; z-index: 50; right: 0; bottom: 0; left: 0; display: grid; grid-template-columns: repeat(5, 1fr); padding: 6px 4px env(safe-area-inset-bottom); border-top: 1px solid rgb(226 232 240 / 90%); background: rgb(255 255 255 / 94%); box-shadow: 0 -8px 24px rgb(15 23 42 / 6%); backdrop-filter: blur(16px); }
.mobile-bar a, .mobile-bar button { min-width: 0; min-height: 56px; padding: 6px 2px; border: 0; border-radius: 10px; background: transparent; color: #64748b; font-size: 11px; text-align: center; text-decoration: none; }
.mobile-bar a, .mobile-bar button { display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 3px; }
.mobile-bar :deep(.el-icon) { font-size: 20px; }
.mobile-bar .active { color: var(--el-color-primary); font-weight: 600; }
.mobile-bar .active::after { position: absolute; top: 3px; width: 18px; height: 3px; border-radius: 999px; background: var(--el-color-primary); content: ""; }
.mobile-bar a, .mobile-bar button { position: relative; }
.mobile-drawer :deep(.el-menu) { border-right: 0; }
.mobile-drawer :deep(.el-menu-item) { min-height: 48px; gap: 4px; border-radius: 10px; }
@media (max-width: 767px) { .mobile-nav { display: block; } }
</style>
