<script setup lang="ts">
definePageMeta({ layout: "default", middleware: "auth" });

const { status } = useAuth();
const passkeyCount = ref(0);
const otpConfigured = computed(() => status.value?.otpConfigured === true);
</script>

<template>
  <div class="account-page">
    <header><el-text type="info">个人账户</el-text><h1>账户安全</h1><p>管理您的登录验证方式和可信设备。</p></header>
    <PasskeyManager :otp-configured="otpConfigured" @count="passkeyCount = $event" />
    <OtpSetupCard v-if="!otpConfigured" />
    <OtpResetCard v-else :has-other-factor="passkeyCount > 0" />
    <TrustedDevicesCard />
  </div>
</template>

<style scoped>
.account-page { min-width: 0; display: grid; gap: 24px; }
h1, p { margin: 0; }
h1 { margin-top: 4px; font-size: 28px; }
header p { margin-top: 6px; color: var(--el-text-color-secondary); }
</style>
