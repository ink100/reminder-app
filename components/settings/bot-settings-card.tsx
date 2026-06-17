"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type BotSettings = {
  enabled: boolean;
  chatId: string;
  tokenConfigured: boolean;
  botName: string;
  botUsername: string;
  lastTestAt: string | null;
  lastTestStatus: string | null;
};

type BotSettingsCardProps = {
  initialValues: BotSettings;
};

function formatTime(value: string | null) {
  if (!value) return "暂无";
  return new Date(value).toLocaleString("zh-CN");
}

export function BotSettingsCard({ initialValues }: BotSettingsCardProps) {
  const [enabled, setEnabled] = useState(initialValues.enabled);
  const [chatId, setChatId] = useState(initialValues.chatId);
  const [token, setToken] = useState("");
  const [clearToken, setClearToken] = useState(false);
  const [tokenConfigured, setTokenConfigured] = useState(initialValues.tokenConfigured);
  const [botName, setBotName] = useState(initialValues.botName);
  const [botUsername, setBotUsername] = useState(initialValues.botUsername);
  const [lastTestAt, setLastTestAt] = useState(initialValues.lastTestAt);
  const [lastTestStatus, setLastTestStatus] = useState(initialValues.lastTestStatus);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function applySavedSettings(item: Partial<BotSettings>) {
    if (typeof item.enabled === "boolean") setEnabled(item.enabled);
    if (typeof item.chatId === "string") setChatId(item.chatId);
    if (typeof item.tokenConfigured === "boolean") setTokenConfigured(item.tokenConfigured);
    if (typeof item.botName === "string") setBotName(item.botName);
    if (typeof item.botUsername === "string") setBotUsername(item.botUsername);
    if ("lastTestAt" in item) setLastTestAt(item.lastTestAt ?? null);
    if ("lastTestStatus" in item) setLastTestStatus(item.lastTestStatus ?? null);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/bot", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled, token, clearToken, chatId }),
      });
      const data = (await response.json()) as { error?: string; item?: BotSettings };

      if (!response.ok) {
        throw new Error(data.error ?? "保存失败");
      }

      if (data.item) {
        applySavedSettings(data.item);
      }
      setToken("");
      setClearToken(false);
      setMessage("✅ Bot 配置已保存");
    } catch (error) {
      setMessage("❌ " + (error instanceof Error ? error.message : "保存失败"));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/bot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await response.json()) as { error?: string; item?: BotSettings };

      if (!response.ok) {
        throw new Error(data.error ?? "测试通知发送失败");
      }

      if (data.item) {
        applySavedSettings(data.item);
      }
      setMessage("✅ 测试通知已发送");
    } catch (error) {
      setMessage("❌ " + (error instanceof Error ? error.message : "测试通知发送失败"));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm text-slate-500">Telegram Bot</p>
          <h2 className="text-xl font-semibold text-slate-950">Bot 通知管理</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            统一管理 Bot Token 和接收会话，为后续探针告警、提醒通知、系统状态推送做准备。Token 仅加密保存，页面不会回显明文。
          </p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {enabled ? "通知已启用" : "通知未启用"}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs text-slate-500">Token 状态</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{tokenConfigured ? "已保存" : "未配置"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs text-slate-500">Bot</p>
          <p className="mt-1 truncate text-lg font-semibold text-slate-900">
            {botUsername ? `@${botUsername}` : botName || "待识别"}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs text-slate-500">最近测试</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{formatTime(lastTestAt)}</p>
          {lastTestStatus && <p className="mt-1 truncate text-xs text-slate-500">{lastTestStatus}</p>}
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          启用 Telegram Bot 通知
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Bot Token</label>
            <Input
              type="password"
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                if (event.target.value) setClearToken(false);
              }}
              placeholder={tokenConfigured ? "已保存 Token；留空则保持不变" : "输入 Telegram Bot Token"}
            />
            <p className="text-xs text-slate-500">保存时会调用 Telegram getMe 校验 Token，并自动记录 Bot 名称。</p>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={clearToken}
                onChange={(event) => {
                  setClearToken(event.target.checked);
                  if (event.target.checked) setToken("");
                }}
              />
              清空已保存的 Bot Token
            </label>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">默认接收 Chat ID</label>
            <Input value={chatId} onChange={(event) => setChatId(event.target.value)} placeholder="例如 5690564836 或群组 ID" />
            <p className="text-xs text-slate-500">用户或群组需要先和 Bot 建立会话；群组通常是负数 ID。</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-medium">后续扩展预留</p>
        <p className="mt-1">探针告警、提醒到期、SSL 证书过期、任务失败等通知都可以统一调用这里的 Bot 配置。</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-h-5 text-sm text-slate-600">{message ?? ""}</p>
        <div className="flex gap-3">
          <Button type="button" className="bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-100" onClick={handleTest} disabled={testing || saving}>
            {testing ? "发送中..." : "发送测试通知"}
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || testing}>
            {saving ? "保存中..." : "保存 Bot 配置"}
          </Button>
        </div>
      </div>
    </div>
  );
}
