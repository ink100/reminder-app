import { BotSettingsCard } from "@/components/settings/bot-settings-card";
import { ensureAppSettings } from "@/lib/bootstrap-settings";
import { getEditableTelegramBotSettings } from "@/lib/telegram-bot";

export default async function BotSettingsPage() {
  const settings = await ensureAppSettings();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">通知中心</p>
        <h1 className="text-2xl font-semibold text-slate-950">Bot 管理</h1>
      </div>
      <BotSettingsCard initialValues={getEditableTelegramBotSettings(settings)} />
    </div>
  );
}
