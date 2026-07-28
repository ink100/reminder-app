import { redirect } from "next/navigation";

import { AuthEntry } from "@/components/auth/auth-entry";

import { getCurrentSession } from "@/lib/session";
import { hasTrustedDeviceCookie } from "@/lib/trusted-device";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AuthPage() {
  const [session, passkeyCount] = await Promise.all([
    getCurrentSession(),
    prisma.webAuthnCredential.count(),
  ]);

  if (session) {
    redirect("/reminders");
  }

  if (await hasTrustedDeviceCookie()) {
    redirect("/api/auth/trusted/restore?next=/reminders");
  }

  return (
    <AuthEntry
      otpConfigured={Boolean(await prisma.userTotpFactor.findFirst({ where: { revokedAt: null } }))}
      hasPasskeyCredentials={passkeyCount > 0}
      redirectTo="/reminders"
      eyebrow="系统安全验证"
      title="登录后进入到期提醒系统"
      description="登录成功后默认进入提醒页面；如果后台还没有配置 OTP 密钥，首次进入会先显示二维码完成绑定。"
    />
  );
}
