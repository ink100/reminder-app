import { redirect } from "next/navigation";

import { AuthEntry } from "@/components/auth/auth-entry";
import { ensureAppSettings } from "@/lib/bootstrap-settings";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AuthPage() {
  const [settings, session] = await Promise.all([ensureAppSettings(), getCurrentSession()]);

  if (session) {
    redirect("/inventory");
  }

  return (
    <AuthEntry
      otpConfigured={Boolean(settings.otpSecretEncrypted)}
      redirectTo="/inventory"
      eyebrow="系统安全验证"
      title="登录后进入库存通知与提醒系统"
      description="登录成功后默认进入库存通知页面；如果后台还没有配置 OTP 密钥，首次进入会先显示二维码完成绑定。"
    />
  );
}
