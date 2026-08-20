<script setup lang="ts">
const { actor } = useAuth();
</script>

<template>
  <ElContainer class="app-shell">
    <SideNav :role="actor?.role" />
    <ElContainer class="content-column">
      <TopNav />
      <ElMain class="app-main">
        <slot />
      </ElMain>
    </ElContainer>
    <MobileNav :role="actor?.role" />
    <FloatingVoiceAssistant />
  </ElContainer>
</template>

<style scoped>
.app-shell { width: min(100%, 1280px); min-height: 100dvh; margin: 0 auto; gap: 24px; padding: 24px; }
.content-column { min-width: 0; flex-direction: column; }
.app-main { flex: 1; padding: 24px; overflow: visible; border: 1px solid #e2e8f0; border-radius: 16px; background: white; box-shadow: 0 1px 3px rgb(15 23 42 / 8%); }
@media (max-width: 767px) {
  .app-shell { display: block; padding: max(12px, env(safe-area-inset-top)) 12px calc(76px + env(safe-area-inset-bottom)); }
  .app-main { padding: 16px; }
}
</style>
