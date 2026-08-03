<script setup lang="ts">
type AppError = {
  statusCode?: number;
  statusMessage?: string;
};

defineProps<{
  error: AppError;
}>();

const recover = () => clearError({ redirect: "/" });
</script>

<template>
  <main class="error-page">
    <section class="error-card" role="alert">
      <p class="error-code">{{ error.statusCode ?? 500 }}</p>
      <h1>页面暂时无法显示</h1>
      <p>请稍后重试，或返回首页继续使用。</p>
      <ElButton type="primary" @click="recover">返回首页</ElButton>
    </section>
  </main>
</template>