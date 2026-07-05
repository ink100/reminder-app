"use client";

import { useState } from "react";

type DashboardProps = {
  stats: { notifications: number; pendingJobs: number; failedJobs: number; channels: number };
  apiKeys: Array<{ id: string; name: string; apiKey: string; enabled: boolean }>;
  groups: Array<{ id: string; name: string; description: string | null; enabled: boolean }>;
  channels: Array<{ id: string; name: string; type: string; config: string; enabled: boolean }>;
  templates: Array<{ id: string; name: string; channelType: string; content: string; enabled: boolean }>;
  notifications: Array<{ id: string; title: string; status: string; createdAt: string; group: string }>;
};

async function postJson(url: string, body: unknown = {}) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || "请求失败");
  return data;
}

export function NotificationCenterDashboard({ stats, apiKeys, groups, channels, templates, notifications }: DashboardProps) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-600">Notification Center</p>
          <h1 className="text-2xl font-semibold text-slate-950">通知管理</h1>
          <p className="mt-1 text-sm text-slate-500">接收 Worker 事件、持久化通知、队列派发、多渠道发送。</p>
        </div>
        <button disabled={busy} onClick={() => run(() => postJson("/api/notification-center/dispatch"), "已触发一次队列派发")} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">手动派发队列</button>
      </div>

      {message ? <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div> : null}

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["通知总数", stats.notifications],
          ["待派发任务", stats.pendingJobs],
          ["死信任务", stats.failedJobs],
          ["启用渠道", stats.channels],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-950">快速创建</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <button disabled={busy} onClick={() => run(() => postJson("/api/notification-center/api-keys", { name: "Worker Key" }), "已创建 API Key，请在列表复制保存" )} className="rounded-lg border border-slate-200 px-4 py-3 text-left text-sm hover:bg-slate-50">生成 Worker API Key</button>
          <button disabled={busy} onClick={() => run(() => postJson("/api/notification-center/groups", { name: "server", description: "服务器通知", enabled: true }), "已创建/更新 server 分组" )} className="rounded-lg border border-slate-200 px-4 py-3 text-left text-sm hover:bg-slate-50">创建默认 server 分组</button>
          <button disabled={busy} onClick={() => run(() => postJson("/api/notification-center/channels", { type: "Telegram", name: "默认 Telegram", config: {}, enabled: true }), "已创建 Telegram 渠道（默认读取 Bot 通知配置）" )} className="rounded-lg border border-slate-200 px-4 py-3 text-left text-sm hover:bg-slate-50">创建 Telegram 渠道</button>
          <button disabled={busy} onClick={() => run(() => postJson("/api/notification-center/templates", { name: "Telegram 默认模板", channel_type: "Telegram", content: "**{{title}}**\n\n{{summary}}\n事件：{{event_type}}\n来源：{{source}}\nPayload：{{payload}}", enabled: true }), "已创建 Telegram 模板" )} className="rounded-lg border border-slate-200 px-4 py-3 text-left text-sm hover:bg-slate-50">创建 Telegram 模板</button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">API Keys</h2>
          <div className="mt-3 space-y-2 text-sm">
            {apiKeys.map((item) => <div key={item.id} className="rounded-lg bg-slate-50 p-3"><div className="font-medium">{item.name}</div><code className="text-xs text-slate-500">{item.apiKey}</code></div>)}
            {apiKeys.length === 0 ? <p className="text-slate-500">暂无 Key</p> : null}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-950">分组 / 渠道 / 模板</h2>
          <div className="mt-3 space-y-3 text-sm text-slate-600">
            <p>分组：{groups.map((g) => g.name).join("、") || "无"}</p>
            <p>渠道：{channels.map((c) => `${c.name}(${c.type})`).join("、") || "无"}</p>
            <p>模板：{templates.map((t) => `${t.name}(${t.channelType})`).join("、") || "无"}</p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-950">最近通知</h2>
        <div className="mt-3 divide-y divide-slate-100 text-sm">
          {notifications.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <div className="font-medium text-slate-900">{item.title}</div>
                <div className="text-xs text-slate-500">{item.group} · {new Date(item.createdAt).toLocaleString("zh-CN")}</div>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{item.status}</span>
            </div>
          ))}
          {notifications.length === 0 ? <p className="py-6 text-center text-slate-500">暂无通知</p> : null}
        </div>
      </section>
    </div>
  );
}
