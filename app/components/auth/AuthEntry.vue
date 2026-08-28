<script setup lang="ts">
import { ref } from "vue";

const props = withDefaults(defineProps<{
  otpConfigured: boolean;
  hasPasskeyCredentials?: boolean;
  redirectTo?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
}>(), {
  hasPasskeyCredentials: false,
  redirectTo: "/reminders",
  eyebrow: "库存通知登录",
  title: "进入库存通知页前先做安全验证",
  description: "使用动态验证码或通行密钥登录。登录后可在设置中管理安全凭据和可信设备。",
});

const method = ref<"otp" | "passkey">(props.hasPasskeyCredentials ? "passkey" : "otp");
</script>

<template>
  <main class="auth-entry">
    <section class="intro">
      <p>{{ eyebrow }}</p>
      <h1>{{ title }}</h1>
      <div>{{ description }}</div>
    </section>
    <section class="panel">
      <div class="mobile-title">
        <p>{{ eyebrow }}</p>
        <h1>{{ title }}</h1>
      </div>
      <ElSegmented v-model="method" class="auth-methods" :options="[{ label: '通行密钥', value: 'passkey' }, { label: '动态验证码', value: 'otp' }]" block />
      <ElAlert
        v-if="method === 'otp' && !otpConfigured"
        title="当前没有已启用的 OTP 账户，请使用通行密钥登录或联系管理员获取邀请。"
        type="warning"
        :closable="false"
        show-icon
      />
      <PasskeyLogin v-if="method === 'passkey'" :redirect-to="redirectTo" />
      <OtpLoginForm v-else :redirect-to="redirectTo" />
      <p v-if="method === 'passkey' && !hasPasskeyCredentials" class="note">还没有通行密钥？请使用 OTP 登录，或通过邀请链接激活账户。</p>
    </section>
  </main>
</template>

<style scoped>
.auth-entry { width: min(100% - 32px, 980px); min-height: 100dvh; margin: auto; display: flex; align-items: center; gap: 32px; padding: 32px 0; }
.intro { width: 48%; padding: 40px; border-radius: 20px; color: #fff; background: linear-gradient(145deg, #0f172a, #172554); box-shadow: 0 18px 42px rgb(15 23 42 / 16%); }
.intro p, .mobile-title p { margin: 0; color: #94a3b8; font-size: 13px; font-weight: 700; text-transform: uppercase; }
.intro h1 { margin: 16px 0; font-size: clamp(30px, 3.2vw, 36px); line-height: 1.2; text-wrap: balance; }
.intro div { color: #cbd5e1; line-height: 1.8; }
.panel { width: 52%; min-width: 0; display: grid; gap: 16px; }
.panel > * { width: 100%; min-width: 0; }
.auth-methods { min-height: 48px; padding: 4px; border: 1px solid #dbe3ee; border-radius: 12px; background: #eef2f7; }
.auth-methods :deep(.el-segmented__item) { min-width: 0; min-height: 38px; color: #526176; font-weight: 600; }
.auth-methods :deep(.el-segmented__item.is-selected) { color: white; }
.auth-methods :deep(.el-segmented__item-selected) { border-radius: 9px; box-shadow: 0 2px 8px rgb(15 23 42 / 10%); }
.mobile-title { display: none; }
.note { margin: 0; color: var(--el-text-color-secondary); font-size: 12px; text-align: center; }
@media (max-width: 760px) {
  .auth-entry { width: min(100% - 32px, 480px); min-height: 100dvh; align-items: flex-start; padding: max(36px, env(safe-area-inset-top)) 0 calc(32px + env(safe-area-inset-bottom)); }
  .intro { display: none; }
  .panel { width: 100%; }
  .mobile-title { display: block; }
  .mobile-title h1 { margin: 7px 0 4px; color: #0f172a; font-size: 24px; line-height: 1.3; text-wrap: balance; }
}
</style>
