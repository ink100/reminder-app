import { AppShell } from "@/components/layout/app-shell";
import { AuthEntry } from "@/components/auth/auth-entry";
import { InventoryPageContent } from "@/components/inventory/inventory-page-content";
import { ensureAppSettings } from "@/lib/bootstrap-settings";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function InventoryEntryPage() {
  const [settings, session] = await Promise.all([ensureAppSettings(), getCurrentSession()]);

  if (!session) {
    return (
      <AuthEntry
        otpConfigured={Boolean(settings.otpSecretEncrypted)}
        redirectTo="/inventory"
        eyebrow="库存通知入口"
        title="先验证 OTP，再进入库存通知页面"
        description="库存监控、手动刷新和通知开关都集中在这个页面。首次进入未绑定时会先显示二维码，绑定后每次登录都需要输入一次动态验证码。"
      />
    );
  }

  return (
    <AppShell>
      <InventoryPageContent />
    </AppShell>
  );
}