"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

type SettingsFormProps = {
  initialValues: {
    appName: string;
    timezone: string;
    emailNotificationsEnabled: boolean;
    notificationEmail: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpFromEmail: string;
    smtpFromName: string;
    smtpPasswordConfigured: boolean;
  };
};

export function SettingsForm({ initialValues }: SettingsFormProps) {
  const router = useRouter();
  const [appName, setAppName] = useState(initialValues.appName);
  const [timezone, setTimezone] = useState(initialValues.timezone);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(initialValues.emailNotificationsEnabled);
  const [notificationEmail, setNotificationEmail] = useState(initialValues.notificationEmail);
  const [smtpHost, setSmtpHost] = useState(initialValues.smtpHost);
  const [smtpPort, setSmtpPort] = useState(String(initialValues.smtpPort));
  const [smtpUser, setSmtpUser] = useState(initialValues.smtpUser);
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFromEmail, setSmtpFromEmail] = useState(initialValues.smtpFromEmail);
  const [smtpFromName, setSmtpFromName] = useState(initialValues.smtpFromName);
  const [smtpPasswordConfigured, setSmtpPasswordConfigured] = useState(initialValues.smtpPasswordConfigured);
  const [clearSmtpPass, setClearSmtpPass] = useState(false);
  const [testEmail, setTestEmail] = useState(initialValues.notificationEmail);
  const [testingEmail, setTestingEmail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          appName,
          timezone,
          emailNotificationsEnabled,
          notificationEmail: notificationEmail.trim() ? notificationEmail.trim() : null,
          smtpHost,
          smtpPort: Number(smtpPort || 0),
          smtpUser,
          smtpPass,
          smtpFromEmail,
          smtpFromName,
          clearSmtpPass,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        item?: { smtpPasswordConfigured?: boolean };
      };
      if (!response.ok) {
        throw new Error(data.error ?? "保存配置失败");
      }

      setSmtpPass("");
      setClearSmtpPass(false);
      setSmtpPasswordConfigured(Boolean(data.item?.smtpPasswordConfigured));
      setTestEmail(notificationEmail.trim() ? notificationEmail.trim() : testEmail);
      setMessage("配置已保存");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存配置失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestEmail() {
    setTestingEmail(true);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/test-email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: testEmail.trim() ? testEmail.trim() : null,
        }),
      });

      const data = (await response.json()) as { error?: string; sentTo?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "测试邮件发送失败");
      }

      setMessage(`测试邮件已发送到 ${data.sentTo ?? testEmail}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "测试邮件发送失败");
    } finally {
      setTestingEmail(false);
    }
  }

  return (
    <form className="space-y-4 rounded-xl border border-slate-200 bg-white p-6" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">系统名称</label>
          <Input value={appName} onChange={(e) => setAppName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">时区</label>
          <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} required />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={emailNotificationsEnabled}
            onChange={(e) => setEmailNotificationsEnabled(e.target.checked)}
          />
          启用邮箱提醒
        </label>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">提醒接收邮箱</label>
          <Input
            type="email"
            value={notificationEmail}
            onChange={(e) => setNotificationEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">测试收件邮箱</label>
          <Input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="留空则使用提醒接收邮箱"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              className="bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-100"
              disabled={testingEmail}
              onClick={handleTestEmail}
            >
              {testingEmail ? "测试发送中..." : "发送测试邮件"}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div>
          <p className="text-sm font-medium text-slate-700">邮件服务配置</p>
          <p className="text-xs text-slate-500">单用户模式下可直接在这里配置 SMTP；密码会加密保存。</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">SMTP Host</label>
            <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">SMTP Port</label>
            <Input value={smtpPort} type="number" min={1} max={65535} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">SMTP User</label>
            <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="mailer@example.com" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">SMTP Password</label>
            <Input
              type="password"
              value={smtpPass}
              onChange={(e) => {
                setSmtpPass(e.target.value);
                if (e.target.value) {
                  setClearSmtpPass(false);
                }
              }}
              placeholder={smtpPasswordConfigured ? "已保存密码；留空则保持不变" : "输入 SMTP 密码"}
            />
            <p className="text-xs text-slate-500">{smtpPasswordConfigured ? "当前已保存 SMTP 密码。" : "当前未保存 SMTP 密码。"}</p>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={clearSmtpPass}
                onChange={(e) => {
                  setClearSmtpPass(e.target.checked);
                  if (e.target.checked) {
                    setSmtpPass("");
                  }
                }}
              />
              清空已保存的 SMTP 密码
            </label>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">发件邮箱</label>
            <Input value={smtpFromEmail} type="email" onChange={(e) => setSmtpFromEmail(e.target.value)} placeholder="bot@example.com" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">发件人名称</label>
            <Input value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)} placeholder="提醒助手" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">{message ?? ""}</p>
        <Button type="submit" disabled={saving}>{saving ? "保存中..." : "保存配置"}</Button>
      </div>
    </form>
  );
}
