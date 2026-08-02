"use client";

import { useState } from "react";

type Group = { id: string; name: string; description: string | null; enabled: boolean };
type Channel = { id: string; name: string; type: string; enabled: boolean; isDefault: boolean; configured: boolean };
type Template = { id: string; name: string; channelType: string; content: string; enabled: boolean; groupId: string | null; isDefault: boolean };
type GroupRoute = { groupId: string; channelId: string; mode: "custom" | "disabled"; templateId: string | null; configOverrideKeys: string[] };
type RouteMode = "inherit" | "custom" | "disabled";

type DashboardProps = {
  stats: { notifications: number; pendingJobs: number; failedJobs: number; channels: number };
  apiKeys: Array<{ id: string; name: string; apiKey: string; enabled: boolean; scopes?: string[] }>;
  groups: Group[];
  channels: Channel[];
  templates: Template[];
  routes: GroupRoute[];
  notifications: Array<{ id: string; title: string; status: string; createdAt: string; group: string }>;
};

type RouteDraft = { mode: RouteMode; templateId: string; configText: string };
type TemplateDraft = { id: string | null; name: string; channelType: string; groupId: string; content: string; enabled: boolean; isDefault: boolean };

const emptyTemplate: TemplateDraft = {
  id: null,
  name: "",
  channelType: "Telegram",
  groupId: "",
  content: "**{{title}}**\n\n{{summary}}\n\n事件：{{event_type}}\n来源：{{source}}",
  enabled: true,
  isDefault: false,
};

async function requestJson(url: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || "请求失败");
  return data;
}

function routeLabel(channel: Channel, route?: GroupRoute) {
  if (route?.mode === "disabled") return "明确禁用";
  if (route?.mode === "custom") return "分组自定义";
  return channel.isDefault ? "继承默认" : "未配置";
}

function routeBadgeClass(channel: Channel, route?: GroupRoute) {
  if (route?.mode === "disabled") return "bg-rose-50 text-rose-700";
  if (route?.mode === "custom") return "bg-violet-50 text-violet-700";
  return channel.isDefault ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600";
}

export function NotificationCenterDashboard({ stats, apiKeys, groups, channels, templates, routes, notifications }: DashboardProps) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id ?? "");
  const [routeDrafts, setRouteDrafts] = useState<Record<string, RouteDraft>>({});
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>(emptyTemplate);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [apiKeyType, setApiKeyType] = useState<"worker" | "ai">("worker");

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null;

  function currentRoute(groupId: string, channelId: string) {
    return routes.find((route) => route.groupId === groupId && route.channelId === channelId);
  }

  function draftFor(groupId: string, channel: Channel): RouteDraft {
    const key = `${groupId}:${channel.id}`;
    const stored = routeDrafts[key];
    if (stored) return stored;
    const route = currentRoute(groupId, channel.id);
    return {
      mode: route?.mode ?? "inherit",
      templateId: route?.templateId ?? "",
      configText: "",
    };
  }

  function updateRouteDraft(groupId: string, channel: Channel, patch: Partial<RouteDraft>) {
    const key = `${groupId}:${channel.id}`;
    setRouteDrafts((current) => ({ ...current, [key]: { ...draftFor(groupId, channel), ...patch } }));
  }

  async function run(action: () => Promise<unknown>, success: string, reload = true) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
      if (reload) window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function saveRoute(group: Group, channel: Channel) {
    const draft = draftFor(group.id, channel);
    if (draft.mode === "inherit") {
      await run(
        () => requestJson(`/api/notification-center/groups/${group.id}/routes/${channel.id}`, "DELETE"),
        `${group.name} / ${channel.name} 已恢复继承默认配置`,
      );
      return;
    }

    await run(async () => {
      let configOverride: Record<string, unknown> | undefined;
      if (draft.configText.trim()) {
        const parsed = JSON.parse(draft.configText) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("渠道覆盖配置必须是 JSON 对象");
        configOverride = parsed as Record<string, unknown>;
      }
      return requestJson(`/api/notification-center/groups/${group.id}/routes/${channel.id}`, "PUT", {
        mode: draft.mode,
        templateId: draft.mode === "custom" ? draft.templateId || null : null,
        ...(configOverride ? { configOverride } : {}),
      });
    }, `${group.name} / ${channel.name} 配置已保存`);
  }

  function editTemplate(template: Template) {
    setTemplateDraft({
      id: template.id,
      name: template.name,
      channelType: template.channelType,
      groupId: template.groupId ?? "",
      content: template.content,
      enabled: template.enabled,
      isDefault: template.isDefault,
    });
  }

  async function saveTemplate() {
    const body = {
      name: templateDraft.name,
      channel_type: templateDraft.channelType,
      content: templateDraft.content,
      enabled: templateDraft.enabled,
      group_id: templateDraft.groupId || null,
      is_default: templateDraft.groupId ? false : templateDraft.isDefault,
    };
    await run(
      () => templateDraft.id
        ? requestJson(`/api/notification-center/templates/${templateDraft.id}`, "PATCH", body)
        : requestJson("/api/notification-center/templates", "POST", body),
      templateDraft.id ? "模板已更新；已入队任务仍使用创建时的内容快照" : "自定义模板已创建",
    );
  }

  const editingTemplate = Boolean(templateDraft.id);

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-600">Notification Center</p>
          <h1 className="text-2xl font-semibold text-slate-950">通知管理</h1>
          <p className="mt-1 text-sm text-slate-500">每个分组可继承默认配置、使用独立配置或明确禁用；模板支持自定义。</p>
        </div>
        <button disabled={busy} onClick={() => run(() => requestJson("/api/notification-center/dispatch", "POST", {}), "已触发一次队列派发")} className="min-h-11 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:w-auto">手动派发队列</button>
      </div>

      {message ? <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">{message}</div> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["通知总数", stats.notifications], ["待派发任务", stats.pendingJobs], ["死信任务", stats.failedJobs], ["启用渠道", stats.channels]].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">分组配置</h2>
            <p className="mt-1 text-sm text-slate-500">没有覆盖记录时继承默认渠道和默认模板；明确禁用后不会回退。</p>
          </div>
          <select value={selectedGroup?.id ?? ""} onChange={(event) => setSelectedGroupId(event.target.value)} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm">
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}{group.enabled ? "" : "（已停用）"}</option>)}
          </select>
        </div>

        {selectedGroup ? (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="min-w-0 flex-1"><span className="font-medium text-slate-900">{selectedGroup.name}</span><span className="ml-2 text-slate-500">{selectedGroup.description || "无说明"}</span></div>
              <button disabled={busy} onClick={() => run(() => requestJson(`/api/notification-center/groups/${selectedGroup.id}`, "PATCH", { enabled: !selectedGroup.enabled }), selectedGroup.enabled ? "分组已停用" : "分组已启用")} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium">{selectedGroup.enabled ? "停用分组" : "启用分组"}</button>
            </div>

            {channels.map((channel) => {
              const route = currentRoute(selectedGroup.id, channel.id);
              const draft = draftFor(selectedGroup.id, channel);
              const availableTemplates = templates.filter((template) => template.channelType === channel.type && template.enabled && (!template.groupId || template.groupId === selectedGroup.id));
              const defaultTemplate = availableTemplates.find((template) => !template.groupId && template.isDefault) ?? availableTemplates.find((template) => !template.groupId);
              return (
                <div key={channel.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-slate-950">{channel.name}</h3>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{channel.type}</span>
                        {channel.isDefault ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">默认渠道</span> : null}
                        {!channel.enabled ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700">全局停用</span> : null}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">默认模板：{defaultTemplate?.name ?? "未配置"} · 渠道参数：{channel.configured ? "已配置" : "使用应用全局设置"}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${routeBadgeClass(channel, route)}`}>{routeLabel(channel, route)}</span>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    <label className="text-sm text-slate-700">配置方式
                      <select value={draft.mode} onChange={(event) => updateRouteDraft(selectedGroup.id, channel, { mode: event.target.value as RouteMode })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3">
                        <option value="inherit">继承默认</option>
                        <option value="custom">分组自定义</option>
                        <option value="disabled">明确禁用</option>
                      </select>
                    </label>
                    <label className="text-sm text-slate-700">消息模板
                      <select disabled={draft.mode !== "custom"} value={draft.templateId} onChange={(event) => updateRouteDraft(selectedGroup.id, channel, { templateId: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 disabled:bg-slate-100">
                        <option value="">继承默认模板</option>
                        {availableTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.groupId ? "（分组）" : template.isDefault ? "（默认）" : "（共享）"}</option>)}
                      </select>
                    </label>
                    <label className="text-sm text-slate-700">渠道参数覆盖（JSON，可选）
                      <input disabled={draft.mode !== "custom"} value={draft.configText} onChange={(event) => updateRouteDraft(selectedGroup.id, channel, { configText: event.target.value })} placeholder={channel.type === "Telegram" ? '{"chatId":"..."}' : channel.type === "Email" ? '{"to":"user@example.com"}' : '{"url":"https://..."}'} className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 px-3 text-xs disabled:bg-slate-100" />
                    </label>
                  </div>
                  {route?.configOverrideKeys.length ? <p className="mt-2 text-xs text-slate-500">已保存覆盖字段：{route.configOverrideKeys.join("、")}。出于安全考虑不回显字段值；留空保存表示保持原值。</p> : null}
                  <div className="mt-3 flex justify-end"><button disabled={busy} onClick={() => void saveRoute(selectedGroup, channel)} className="min-h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white disabled:opacity-50">保存此渠道配置</button></div>
                </div>
              );
            })}
            {channels.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">暂无渠道，请先创建通知渠道。</p> : null}
          </div>
        ) : <p className="mt-4 text-sm text-slate-500">暂无通知分组。</p>}

        <div className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-medium text-slate-900">新建分组</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="分组名称，例如 inventory" className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm" />
            <input value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} placeholder="分组说明" className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm" />
            <button disabled={busy || !groupName.trim()} onClick={() => run(() => requestJson("/api/notification-center/groups", "POST", { name: groupName, description: groupDescription, enabled: true }), "分组已创建")} className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-medium disabled:opacity-50">创建分组</button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="font-semibold text-slate-950">自定义模板</h2>
        <p className="mt-1 text-sm text-slate-500">可创建全局共享模板或分组专属模板。支持变量：title、summary、source、event_type、payload.xxx、json。</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)]">
          <div className="space-y-2">
            {templates.map((template) => (
              <button key={template.id} type="button" onClick={() => editTemplate(template)} className={`w-full rounded-lg border p-3 text-left text-sm ${templateDraft.id === template.id ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-900">{template.name}</span><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{template.channelType}</span>{template.isDefault ? <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">默认</span> : null}{template.groupId ? <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700">{groups.find((group) => group.id === template.groupId)?.name ?? "分组模板"}</span> : null}{!template.enabled ? <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-700">停用</span> : null}</div>
                <p className="mt-1 line-clamp-2 break-all text-xs text-slate-500">{template.content}</p>
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2"><h3 className="font-medium text-slate-900">{templateDraft.id ? "编辑模板" : "新建模板"}</h3>{templateDraft.id ? <button type="button" onClick={() => setTemplateDraft(emptyTemplate)} className="text-sm text-blue-600">新建模板</button> : null}</div>
            <div className="mt-3 space-y-3">
              <label className="block text-sm text-slate-700">模板名称<input value={templateDraft.name} onChange={(event) => setTemplateDraft((current) => ({ ...current, name: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-slate-700">渠道类型<select disabled={editingTemplate} value={templateDraft.channelType} onChange={(event) => setTemplateDraft((current) => ({ ...current, channelType: event.target.value }))} className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 disabled:bg-slate-100"><option>Telegram</option><option>Email</option><option>Webhook</option></select></label>
                <label className="text-sm text-slate-700">所属范围<select disabled={editingTemplate} value={templateDraft.groupId} onChange={(event) => setTemplateDraft((current) => ({ ...current, groupId: event.target.value, isDefault: event.target.value ? false : current.isDefault }))} className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 disabled:bg-slate-100"><option value="">全局共享</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
              </div>
              <label className="block text-sm text-slate-700">模板内容<textarea value={templateDraft.content} onChange={(event) => setTemplateDraft((current) => ({ ...current, content: event.target.value }))} rows={8} className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs" /></label>
              <div className="flex flex-wrap gap-4 text-sm text-slate-700"><label className="flex items-center gap-2"><input type="checkbox" checked={templateDraft.enabled} onChange={(event) => setTemplateDraft((current) => ({ ...current, enabled: event.target.checked }))} />启用模板</label><label className="flex items-center gap-2"><input type="checkbox" disabled={Boolean(templateDraft.groupId) || Boolean(templateDraft.id)} checked={templateDraft.isDefault} onChange={(event) => setTemplateDraft((current) => ({ ...current, isDefault: event.target.checked }))} />设为该渠道默认模板</label></div>
              {templateDraft.id ? <p className="text-xs text-slate-500">模板创建后所属范围、渠道类型和默认标识不可切换；可修改名称、内容和启停状态，已入队任务不受影响。</p> : null}
              <button disabled={busy || !templateDraft.name.trim() || !templateDraft.content.trim()} onClick={() => void saveTemplate()} className="min-h-11 w-full rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50">{templateDraft.id ? "保存模板修改" : "创建自定义模板"}</button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="font-semibold text-slate-950">API Keys</h2>
          <p className="mt-1 text-xs text-slate-500">受保护管理页按既有规则完整展示 Key。Worker Key 仅发送通知；AI Key 可调用全部非身份业务 API。</p>
          <div className="mt-3 space-y-2 text-sm">{apiKeys.map((item) => <div key={item.id} className="min-w-0 rounded-lg bg-slate-50 p-3"><div className="break-words font-medium">{item.name} <span className="text-xs text-blue-600">{item.scopes?.includes("ai:all") ? "AI 全模块" : "Worker"}</span></div><code className="block break-all text-xs text-slate-500">{item.apiKey}</code></div>)}</div>
          {newApiKey ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-medium text-amber-800">新生成的 API Key</p><code className="mt-1 block break-all text-xs text-amber-900">{newApiKey}</code></div> : null}
          <div className="mt-3 flex gap-2"><select value={apiKeyType} onChange={(event) => setApiKeyType(event.target.value as "worker" | "ai")} className="min-h-10 rounded-lg border border-slate-200 px-2 text-sm"><option value="worker">普通 Worker Key</option><option value="ai">AI 全模块 Key</option></select><button disabled={busy} onClick={() => run(async () => { const data = await requestJson("/api/notification-center/api-keys", "POST", { name: apiKeyType === "ai" ? "AI Key" : "Worker Key", type: apiKeyType }); setNewApiKey(data.item.apiKey); }, "API Key 已创建", false)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium">生成新 Key</button></div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="font-semibold text-slate-950">最近通知</h2>
          <div className="mt-3 divide-y divide-slate-100 text-sm">{notifications.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><div className="break-words font-medium text-slate-900">{item.title}</div><div className="break-words text-xs text-slate-500">{item.group} · {new Date(item.createdAt).toLocaleString("zh-CN")}</div></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{item.status}</span></div>)}{notifications.length === 0 ? <p className="py-6 text-center text-slate-500">暂无通知</p> : null}</div>
        </div>
      </section>
    </div>
  );
}
