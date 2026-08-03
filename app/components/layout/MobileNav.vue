<script setup lang="ts">
const props = defineProps<{ role?: string | null }>();
const open = ref(false);
const route = useRoute();
const { items, isActive } = useNavigation(() => props.role);
const primaryItems = computed(() => items.value.slice(0, 4));
const moreItems = computed(() => items.value.slice(4));

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
          {{ item.label }}
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
        {{ item.shortLabel }}
      </NuxtLink>
      <button type="button" aria-label="打开更多导航" :aria-expanded="open" @click="open = true">更多</button>
    </nav>
  </div>
</template>

<style scoped>
.mobile-nav { display: none; }
.mobile-bar { position: fixed; z-index: 50; right: 0; bottom: 0; left: 0; display: grid; grid-template-columns: repeat(5, 1fr); padding-bottom: env(safe-area-inset-bottom); border-top: 1px solid #e2e8f0; background: rgb(255 255 255 / 96%); }
.mobile-bar a, .mobile-bar button { min-height: 60px; padding: 8px 2px; border: 0; background: transparent; color: #64748b; font-size: 12px; text-align: center; text-decoration: none; }
.mobile-bar a { display: flex; align-items: center; justify-content: center; }
.mobile-bar .active { color: var(--el-color-primary); font-weight: 600; }
.mobile-drawer :deep(.el-menu) { border-right: 0; }
@media (max-width: 767px) { .mobile-nav { display: block; } }
</style>
