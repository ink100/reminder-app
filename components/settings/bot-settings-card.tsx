"use client";

import { useState, useEffect, useCallback } from "react";

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

type Binding = {
  id: string;
  chatId: string;
  username: string | null;
  firstName: string | null;
  boundAt: string;
  lastActiveAt: string | null;
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

  // 绑定相关
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [bindCode, setBindCode] = useState<{ code: string; expiresAt: string; instructions: string } | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  const fetchBindings = useCallback(async () => {
    try {
      const response = await fetch("/api/settings/bot/bindings");
      if (response.ok) {
        const data = (await response.json()) as { items: Binding[] };
        setBindings(data.items);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchBindings);
  }, [fetchBindings]);

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

  async function handleGenerateBindCode() {
    setGeneratingCode(true);
    setBindCode(null);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/bot/bindings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create-code" }),
      });
      const data = (await response.json()) as { error?: string; code?: string; expiresAt?: string; instructions?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "生成失败");
      }

      setBindCode({ code: data.code!, expiresAt: data.expiresAt!, instructions: data.instructions! });
    } catch (error) {
      setMessage("❌ " + (error instanceof Error ? error.message : "生成失败"));
    } finally {
      setGeneratingCode(false);
    }
  }

  async function handleUnbind(chatIdToUnbind: string) {
    setMessage(null);

    try {
      const response = await fetch("/api/settings/bot/bindings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "unbind", chatId: chatIdToUnbind }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "解绑失败");
      }

      setMessage("✅ 已解绑");
      await fetchBindings();
    } catch (error) {
      setMessage("❌ " + (error instanceof Error ? error.message : "解绑失败"));
    }
  }

  async function copyBindCode() {
    if (bindCode) {
      await navigator.clipboard.writeText(bindCode.code);
      setMessage("✅ 绑定码已复制");
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      {/* Bot 配置 */}
      <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm text-slate-500">Telegram Bot</p>
            <h2 className="text-xl font-semibold text-slate-950">Bot 通知管理</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              统一管理 Bot Token 和绑定会话。保存 Token 后 Bot 会自动轮询消息，处理 /start、/bind 等命令。
            </p>
          </div>
          <span className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {enabled ? "通知已启用" : "通知未启用"}
          </span>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Token 状态</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{tokenConfigured ? "已保存" : "未配置"}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Bot</p>
            <p className="mt-1 break-all text-lg font-semibold text-slate-900">
              {botUsername ? `@${botUsername}` : botName || "待识别"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-500">最近测试</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{formatTime(lastTestAt)}</p>
            {lastTestStatus && <p className="mt-1 break-words text-xs text-slate-500">{lastTestStatus}</p>}
          </div>
        </div>

        <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 md:min-h-0">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            启用 Telegram Bot 通知
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Bot Token</label>
              <Input
                type="password"
                className="md:min-h-0"
                value={token}
                onChange={(event) => {
                  setToken(event.target.value);
                  if (event.target.value) setClearToken(false);
                }}
                placeholder={tokenConfigured ? "已保存 Token；留空则保持不变" : "输入 Telegram Bot Token"}
              />
              <p className="text-xs text-slate-500">保存时将调用 Telegram getMe 校验，并自动开始轮询消息。</p>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-slate-600 md:min-h-0">
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
              <label className="text-sm font-medium text-slate-700">默认 Chat ID（备用）</label>
              <Input value={chatId} onChange={(event) => setChatId(event.target.value)} className="md:min-h-0" placeholder="例如 5690564836" />
              <p className="text-xs text-slate-500">建议使用绑定功能关联账号，此处仅作备用。</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-h-5 break-words text-sm text-slate-600">{message ?? ""}</p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button type="button" className="min-h-11 w-full bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-100 sm:w-auto md:min-h-0" onClick={handleTest} disabled={testing || saving}>
              {testing ? "发送中..." : "发送测试通知"}
            </Button>
            <Button type="button" className="min-h-11 w-full sm:w-auto md:min-h-0" onClick={handleSave} disabled={saving || testing}>
              {saving ? "保存中..." : "保存 Bot 配置"}
            </Button>
          </div>
        </div>
      </div>

      {/* 绑定管理 */}
      <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">绑定管理</h3>
            <p className="mt-1 text-sm text-slate-500">
              绑定的 Telegram 账号可以接收通知。在 Bot 中发送 /start 查看可用命令。
            </p>
          </div>
          <Button type="button" className="min-h-11 w-full sm:w-auto md:min-h-0" onClick={handleGenerateBindCode} disabled={!tokenConfigured || generatingCode}>
            {generatingCode ? "生成中..." : "生成绑定码"}
          </Button>
        </div>

        {/* 绑定码展示 */}
        {bindCode && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-emerald-800">绑定码已生成</p>
                <p className="mt-1 text-xs text-emerald-600">
                  有效期至 {formatTime(bindCode.expiresAt)}，发送给 Bot 完成绑定。
                </p>
              </div>
              <button
                onClick={copyBindCode}
                className="min-h-11 w-full break-all rounded-lg bg-white px-4 py-2 text-lg font-bold tracking-widest text-emerald-800 shadow-sm ring-1 ring-emerald-200 hover:bg-emerald-100 sm:w-auto md:min-h-0"
              >
                {bindCode.code}
              </button>
            </div>
            <p className="mt-2 text-sm text-emerald-700">在 Telegram 中向 Bot 发送：</p>
            <div className="mt-1 break-all rounded-lg bg-white px-3 py-2 font-mono text-sm text-slate-800 shadow-sm">
              /bind {bindCode.code}
            </div>
          </div>
        )}

        {/* 绑定列表 */}
        {bindings.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            {tokenConfigured ? "暂无绑定。生成绑定码并在 Telegram 中发送给 Bot 即可绑定。" : "请先配置 Bot Token。"}
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {bindings.map((binding) => (
              <div key={binding.id} className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {binding.firstName || "未命名"}{binding.username ? ` (@${binding.username})` : ""}
                  </p>
                  <p className="break-all text-xs text-slate-500">
                    Chat ID: {binding.chatId} · 绑定于 {formatTime(binding.boundAt)}
                  </p>
                </div>
                <button
                  onClick={() => handleUnbind(binding.chatId)}
                  className="min-h-11 w-full rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 sm:w-auto md:min-h-0"
                >
                  解绑
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
