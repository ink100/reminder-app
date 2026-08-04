<script setup lang="ts">
import { safeReturnUrl } from "../composables/useApi";

definePageMeta({ layout: "public", middleware: "guest" });

const route = useRoute();
const { status } = useAuth();
const requested = Array.isArray(route.query.returnUrl)
  ? route.query.returnUrl[0]
  : route.query.returnUrl ?? (Array.isArray(route.query.next) ? route.query.next[0] : route.query.next);
const redirectTo = safeReturnUrl(requested, "/reminders");
const trustedRestoreAllowed = route.query.trustedRestore !== "failed";

// Check only cookie presence on the server. Never hydrate the HttpOnly token into client state.
const hasTrustedDevice = import.meta.server
  && /(?:^|;\s*)reminder_trusted_device=/.test(useRequestHeaders(["cookie"]).cookie ?? "");
if (hasTrustedDevice && trustedRestoreAllowed && !status.value?.authenticated) {
  await navigateTo(`/api/auth/trusted/restore?next=${encodeURIComponent(redirectTo)}`, {
    external: true,
    redirectCode: 302,
  });
}
</script>

<template>
  <AuthEntry
    :otp-configured="status?.otpConfigured ?? false"
    :redirect-to="redirectTo"
    eyebrow="系统安全验证"
    title="登录后进入到期提醒系统"
    description="使用 OTP 动态验证码或通行密匙完成验证；可信设备可安全恢复会话。"
  />
</template>
