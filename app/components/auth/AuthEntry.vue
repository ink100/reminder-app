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
  description: "使用动态验证码或通行密匙登录。登录后可在设置中管理安全凭据和可信设备。",
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
      <ElSegmented v-model="method" :options="[{ label: '通行密匙', value: 'passkey' }, { label: 'OTP 验证码', value: 'otp' }]" block />
      <ElAlert
        v-if="method === 'otp' && !otpConfigured"
        title="当前没有已启用的 OTP 账户，请使用通行密匙登录或联系管理员获取邀请。"
        type="warning"
        :closable="false"
        show-icon
      />
      <PasskeyLogin v-if="method === 'passkey'" :redirect-to="redirectTo" />
      <OtpLoginForm v-else :redirect-to="redirectTo" />
      <p v-if="method === 'passkey' && !hasPasskeyCredentials" class="note">还没有通行密匙？请使用 OTP 登录，或通过邀请链接激活账户。</p>
    </section>
  </main>
</template>

<style scoped>
.auth-entry { width: min(980px, calc(100% - 32px)); min-height: 100dvh; margin: auto; display: flex; align-items: center; gap: 28px; }
.intro { width: 55%; padding: 42px; border-radius: 24px; color: #fff; background: #0f172a; box-shadow: var(--el-box-shadow-dark); }
.intro p, .mobile-title p { margin: 0; color: #94a3b8; font-size: 13px; font-weight: 700; text-transform: uppercase; }
.intro h1 { margin: 16px 0; font-size: 38px; line-height: 1.2; }
.intro div { color: #cbd5e1; line-height: 1.8; }
.panel { width: 45%; display: grid; gap: 18px; }
.mobile-title { display: none; }
.note { margin: 0; color: var(--el-text-color-secondary); font-size: 12px; text-align: center; }
@media (max-width: 760px) {
  .auth-entry { width: min(100% - 24px, 480px); padding: 24px 0; }
  .intro { display: none; }
  .panel { width: 100%; }
  .mobile-title { display: block; }
  .mobile-title h1 { margin: 6px 0 0; font-size: 22px; }
}
</style>
