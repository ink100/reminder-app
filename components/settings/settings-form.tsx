"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";

type TaskLog = {
  id: string;
  task: string;
  startedAt: string;
  finishedAt: string | null;
  success: boolean;
  summary: string | null;
};

type SchedulerTask = {
  name: string;
  label: string;
  running: boolean;
};

type SchedulerStatusResponse = {
  tasks?: SchedulerTask[];
  logs?: TaskLog[];
};

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
    reminderEmailEnabled: boolean;
    reminderEmailInterval: number;
    notifyStartHour: number;
    notifyEndHour: number;
  };
  initialTaskLogs?: TaskLog[];
};

const TASK_LABELS: Record<string, string> = {
  "reminder-email": "到期提醒通知",
};

export function SettingsForm({ initialValues, initialTaskLogs = [] }: SettingsFormProps) {
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

  // 定时任务配置
  const [reminderEmailEnabled, setReminderEmailEnabled] = useState(initialValues.reminderEmailEnabled);
  const [reminderEmailInterval, setReminderEmailInterval] = useState(String(initialValues.reminderEmailInterval));

  // 通知时段
  const [notifyStartHour, setNotifyStartHour] = useState(String(initialValues.notifyStartHour));
  const [notifyEndHour, setNotifyEndHour] = useState(String(initialValues.notifyEndHour));

  // 任务运行记录
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>(initialTaskLogs);
  const [schedulerTasks, setSchedulerTasks] = useState<SchedulerTask[]>([]);

  useEffect(() => {
    fetch("/api/scheduler/status")
      .then((res) => res.json())
      .then((data: SchedulerStatusResponse) => {
        if (data.tasks) {
          setSchedulerTasks(data.tasks.map((task) => ({ ...task, label: TASK_LABELS[task.name] ?? task.name })));
        }
        if (data.logs) {
          setTaskLogs(data.logs);
        }
      })
      .catch(() => {});
  }, []);

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
          reminderEmailEnabled,
          reminderEmailInterval: Number(reminderEmailInterval || 1800),
          notifyStartHour: Number(notifyStartHour || 9),
          notifyEndHour: Number(notifyEndHour || 22),
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        item?: {
          smtpPasswordConfigured?: boolean;
          reminderEmailEnabled?: boolean;
          reminderEmailInterval?: number;
          notifyStartHour?: number;
          notifyEndHour?: number;
        };
      };
      if (!response.ok) {
        throw new Error(data.error ?? "保存配置失败");
      }

      setSmtpPass("");
      setClearSmtpPass(false);
      setSmtpPasswordConfigured(Boolean(data.item?.smtpPasswordConfigured));
      setTestEmail(notificationEmail.trim() ? notificationEmail.trim() : testEmail);
      if (data.item) {
        if (typeof data.item.reminderEmailEnabled === "boolean") setReminderEmailEnabled(data.item.reminderEmailEnabled);
        if (typeof data.item.reminderEmailInterval === "number") setReminderEmailInterval(String(data.item.reminderEmailInterval));
        if (typeof data.item.notifyStartHour === "number") setNotifyStartHour(String(data.item.notifyStartHour));
        if (typeof data.item.notifyEndHour === "number") setNotifyEndHour(String(data.item.notifyEndHour));
      }
      setMessage("配置已保存");
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
    <form className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">系统名称</label>
          <Input value={appName} onChange={(e) => setAppName(e.target.value)} className="md:min-h-0" required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">时区</label>
          <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} className="md:min-h-0" required />
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700 md:min-h-0">
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
            className="md:min-h-0"
            onChange={(e) => setNotificationEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">测试收件邮箱</label>
          <Input
            type="email"
            value={testEmail}
            className="md:min-h-0"
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="留空则使用提醒接收邮箱"
          />
          <div className="flex justify-stretch sm:justify-end">
            <Button
              type="button"
              className="min-h-11 w-full bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-100 sm:w-auto md:min-h-0"
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
            <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className="md:min-h-0" placeholder="smtp.example.com" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">SMTP Port</label>
            <Input value={smtpPort} type="number" min={1} max={65535} onChange={(e) => setSmtpPort(e.target.value)} className="md:min-h-0" placeholder="587" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">SMTP User</label>
            <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} className="md:min-h-0" placeholder="mailer@example.com" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">SMTP Password</label>
            <Input
              type="password"
              value={smtpPass}
              className="md:min-h-0"
              onChange={(e) => {
                setSmtpPass(e.target.value);
                if (e.target.value) {
                  setClearSmtpPass(false);
                }
              }}
              placeholder={smtpPasswordConfigured ? "已保存密码；留空则保持不变" : "输入 SMTP 密码"}
            />
            <p className="text-xs text-slate-500">{smtpPasswordConfigured ? "当前已保存 SMTP 密码。" : "当前未保存 SMTP 密码。"}</p>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-slate-600 md:min-h-0">
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
            <Input value={smtpFromEmail} type="email" onChange={(e) => setSmtpFromEmail(e.target.value)} className="md:min-h-0" placeholder="bot@example.com" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">发件人名称</label>
            <Input value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)} className="md:min-h-0" placeholder="提醒助手" />
          </div>
        </div>
      </div>

      {/* 通知时段配置 */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div>
          <p className="text-sm font-medium text-slate-700">通知时段</p>
          <p className="text-xs text-slate-500">只有在这个时间段内才会发送邮件通知。</p>
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 sm:flex sm:items-center sm:gap-4">
          <div className="min-w-0 space-y-1">
            <label className="text-xs font-medium text-slate-700">开始时间（时）</label>
            <Input type="number" min={0} max={23} value={notifyStartHour} onChange={(e) => setNotifyStartHour(e.target.value)} className="w-full sm:w-24 md:min-h-0" />
          </div>
          <span className="pb-3 text-slate-400">~</span>
          <div className="min-w-0 space-y-1">
            <label className="text-xs font-medium text-slate-700">结束时间（时）</label>
            <Input type="number" min={0} max={23} value={notifyEndHour} onChange={(e) => setNotifyEndHour(e.target.value)} className="w-full sm:w-24 md:min-h-0" />
          </div>
        </div>
        <p className="text-xs text-slate-500">默认 9~22（早 9 点到晚 10 点）</p>
      </div>

      {/* 定时任务配置 */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div>
          <p className="text-sm font-medium text-slate-700">定时任务配置</p>
          <p className="text-xs text-slate-500">修改后保存即生效，无需重启服务。</p>
        </div>

        <div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700 md:min-h-0">
            <input
              type="checkbox"
              checked={reminderEmailEnabled}
              onChange={(e) => setReminderEmailEnabled(e.target.checked)}
            />
            启用到期提醒通知发送
          </label>
          {reminderEmailEnabled && (
            <div className="mt-2 max-w-xs space-y-2 sm:ml-6">
              <label className="text-sm font-medium text-slate-700">发送间隔（秒）</label>
              <Input type="number" min={60} max={86400} value={reminderEmailInterval} onChange={(e) => setReminderEmailInterval(e.target.value)} className="md:min-h-0" />
              <p className="text-xs text-slate-500">推荐 1800 秒（30 分钟）</p>
            </div>
          )}
        </div>
      </div>

      {/* 运行状态 */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div>
          <p className="text-sm font-medium text-slate-700">定时任务运行状态</p>
        </div>
        {schedulerTasks.length > 0 && (
          <div className="grid gap-2 md:grid-cols-2">
            {schedulerTasks.map((t) => (
              <div key={t.name} className="flex items-center gap-2 text-sm">
                <span className={`inline-block h-2 w-2 rounded-full ${t.running ? "bg-green-500" : "bg-rose-400"}`} />
                <span className={t.running ? "text-slate-900" : "text-slate-500"}>{t.label}</span>
                <span className="text-xs text-slate-400">{t.running ? "运行中" : "已停止"}</span>
              </div>
            ))}
          </div>
        )}
        <details>
          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">最近任务执行记录</summary>
          {taskLogs.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">暂无记录</p>
          ) : (
            <div className="mt-2 max-h-64 overflow-y-auto space-y-1">
              {taskLogs.slice(0, 30).map((log) => (
                <div key={log.id} className="flex items-start gap-2 rounded bg-white p-2 text-xs">
                  <span className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${log.success ? "bg-green-500" : "bg-rose-500"}`} />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{TASK_LABELS[log.task] ?? log.task}</p>
                    <p className="break-words text-slate-500">{log.summary ?? ""} · {new Date(log.startedAt).toLocaleString("zh-CN")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </details>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="break-words text-sm text-slate-500">{message ?? ""}</p>
        <Button type="submit" className="min-h-11 w-full sm:w-auto md:min-h-0" disabled={saving}>{saving ? "保存中..." : "保存配置"}</Button>
      </div>
    </form>
  );
}
