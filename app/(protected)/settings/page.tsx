import { ensureAppSettings } from "@/lib/bootstrap-settings";
import { getEditableMailSettings } from "@/lib/mail-settings";
import { getTaskRunLogs } from "@/lib/task-runner";
import { SettingsForm } from "@/components/settings/settings-form";
import { PasskeyManager } from "@/components/settings/passkey-manager";
import { R2SettingsCard } from "@/components/settings/r2-settings-card";
import { TrustedDevicesCard } from "@/components/settings/trusted-devices-card";

export default async function SettingsPage() {
  const [settings, logs] = await Promise.all([ensureAppSettings(), getTaskRunLogs()]);

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <p className="text-sm text-slate-500">配置页面</p>
        <h1 className="text-2xl font-semibold text-slate-950">提醒规则与安全设置</h1>
      </div>
      <PasskeyManager />
      <TrustedDevicesCard />
      <R2SettingsCard
        initialValues={{
          r2Endpoint: settings.r2Endpoint || "",
          r2AccessKey: settings.r2AccessKey || "",
          r2SecretKey: settings.r2SecretKey || "",
          r2Bucket: settings.r2Bucket || "",
          r2PublicUrl: settings.r2PublicUrl || "",
          r2CacheControl: settings.r2CacheControl || "public, max-age=86400",
        }}
      />
      <SettingsForm
        initialValues={{
          ...getEditableMailSettings(settings),
          reminderEmailEnabled: settings.reminderEmailEnabled,
          reminderEmailInterval: settings.reminderEmailInterval,
          notifyStartHour: settings.notifyStartHour,
          notifyEndHour: settings.notifyEndHour,
        }}
        initialTaskLogs={logs}
      />
    </div>
  );
}
