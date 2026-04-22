import { ensureAppSettings } from "@/lib/bootstrap-settings";
import { getEditableMailSettings } from "@/lib/mail-settings";
import { OtpResetCard } from "@/components/settings/otp-reset-card";
import { SettingsForm } from "@/components/settings/settings-form";

export default async function SettingsPage() {
  const settings = await ensureAppSettings();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">配置页面</p>
        <h1 className="text-2xl font-semibold text-slate-950">提醒规则与安全设置</h1>
      </div>
      <SettingsForm
        initialValues={getEditableMailSettings(settings)}
      />
      <OtpResetCard />
    </div>
  );
}
