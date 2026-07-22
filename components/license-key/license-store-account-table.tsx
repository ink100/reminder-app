"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { PaymentQrManager } from "@/components/license-key/payment-qr-manager";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ActivationReminder = {
  id: string;
  title: string;
  dueAt: string;
  activationCode: string | null;
};

type StoreAccount = {
  id: string;
  shopName: string;
  phone: string;
  remoteCode: string;
  remotePassword: string;
  isOtherAccount: boolean;
  expiresAt: string;
  activationCode: string;
  reminderId: string | null;
  reminder: ActivationReminder | null;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  shopName: string;
  phone: string;
  remoteCode: string;
  remotePassword: string;
  isOtherAccount: boolean;
  expiresAt: string;
  activationCode: string;
  reminderId: string;
};

const emptyForm: FormState = {
  shopName: "",
  phone: "",
  remoteCode: "",
  remotePassword: "",
  isOtherAccount: false,
  expiresAt: "",
  activationCode: "",
  reminderId: "",
};

function toDateTimeLocal(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function getRemainingDays(value: string) {
  const expiresAt = new Date(value).getTime();
  if (Number.isNaN(expiresAt)) return null;
  return Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
}

function buildFormFromItem(item: StoreAccount): FormState {
  return {
    shopName: item.shopName,
    phone: item.phone,
    remoteCode: item.remoteCode,
    remotePassword: item.remotePassword,
    isOtherAccount: item.isOtherAccount,
    expiresAt: toDateTimeLocal(item.expiresAt),
    activationCode: item.activationCode,
    reminderId: item.reminderId ?? "",
  };
}

export function LicenseStoreAccountTable() {
  const [items, setItems] = useState<StoreAccount[]>([]);
  const [activationReminders, setActivationReminders] = useState<ActivationReminder[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [qrAccountId, setQrAccountId] = useState<string | null>(null);
  const [revealedCredentialIds, setRevealedCredentialIds] = useState<Set<string>>(() => new Set());
  const [copiedPasswordId, setCopiedPasswordId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedReminder = useMemo(
    () => activationReminders.find((reminder) => reminder.id === form.reminderId) ?? null,
    [activationReminders, form.reminderId],
  );

  const loadItems = useCallback(async (keyword: string) => {
    setLoading(true);
    try {
      const query = keyword.trim() ? `?q=${encodeURIComponent(keyword.trim())}` : "";
      const response = await fetch(`/api/license/store-accounts${query}`, { cache: "no-store" });
      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(error?.error ?? "加载店铺账号失败");
      }
      const data = (await response.json()) as { items: StoreAccount[]; activationReminders: ActivationReminder[] };
      setItems(data.items);
      setQrAccountId((current) => current && data.items.some((item) => item.id === current) ? current : null);
      setActivationReminders(data.activationReminders.filter((reminder) => Boolean(reminder.activationCode?.trim())));
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载店铺账号失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadItems(""));
  }, [loadItems]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleReminderChange(reminderId: string) {
    const reminder = activationReminders.find((item) => item.id === reminderId);
    setForm((current) => ({
      ...current,
      reminderId,
      activationCode: reminder?.activationCode?.trim() || current.activationCode,
      expiresAt: reminder ? toDateTimeLocal(reminder.dueAt) : current.expiresAt,
    }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEditing(item: StoreAccount) {
    setEditingId(item.id);
    setForm(buildFormFromItem(item));
    setMessage(`正在编辑：${item.shopName}`);
  }

  function toggleCredentialVisibility(itemId: string) {
    setRevealedCredentialIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  async function copyRemotePassword(item: StoreAccount) {
    try {
      await navigator.clipboard.writeText(item.remotePassword);
      setCopiedPasswordId(item.id);
      setMessage(`已复制“${item.shopName}”的远程密码`);
      window.setTimeout(() => {
        setCopiedPasswordId((current) => current === item.id ? null : current);
      }, 2000);
    } catch {
      setMessage("复制远程密码失败，请检查浏览器剪贴板权限");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(editingId ? "保存中..." : "新增中...");

    try {
      const payload = {
        ...form,
        isOtherAccount: form.isOtherAccount,
        reminderId: form.reminderId || null,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : "",
      };
      const response = await fetch(editingId ? `/api/license/store-accounts/${editingId}` : "/api/license/store-accounts", {
        method: editingId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(error?.error ?? "保存失败");
      }

      resetForm();
      await loadItems(search);
      setMessage(editingId ? "已保存店铺账号" : "已新增店铺账号");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: StoreAccount) {
    if (!window.confirm(`确定删除店铺账号“${item.shopName}”吗？`)) return;
    setDeletingId(item.id);
    setMessage("删除中...");

    try {
      const response = await fetch(`/api/license/store-accounts/${item.id}`, { method: "DELETE" });
      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(error?.error ?? "删除失败");
      }
      if (editingId === item.id) resetForm();
      await loadItems(search);
      setMessage("已删除店铺账号");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-slate-500">店铺账号维护</p>
          <h2 className="text-xl font-semibold text-slate-950">激活码关联店铺表格</h2>
          <p className="mt-1 text-sm text-slate-500">
            维护店铺名、手机号、远程码、明文远程密码、是否他人账号、到期时间，并为每条店铺记录分别保存微信和支付宝二维码截图。
          </p>
        </div>
        <form
          className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 md:w-auto"
          onSubmit={(event) => {
            event.preventDefault();
            void loadItems(search);
          }}
        >
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索店铺/手机号/远程码/激活码" />
          <Button type="submit" className="shrink-0" disabled={loading}>{loading ? "查询中" : "查询"}</Button>
        </form>
      </div>

      <form className="grid min-w-0 gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">店铺名</label>
          <Input value={form.shopName} onChange={(event) => updateForm("shopName", event.target.value)} placeholder="店铺名" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">手机号</label>
          <Input value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} placeholder="手机号" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">远程码</label>
          <Input value={form.remoteCode} onChange={(event) => updateForm("remoteCode", event.target.value)} placeholder="远程码" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">远程密码（明文）</label>
          <Input value={form.remotePassword} onChange={(event) => updateForm("remotePassword", event.target.value)} placeholder="明文远程密码" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">到期时间</label>
          <Input type="datetime-local" value={form.expiresAt} onChange={(event) => updateForm("expiresAt", event.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">关联激活码提醒</label>
          <select
            className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 md:min-h-0"
            value={form.reminderId}
            onChange={(event) => handleReminderChange(event.target.value)}
          >
            <option value="">不关联提醒</option>
            {activationReminders.map((reminder) => (
              <option key={reminder.id} value={reminder.id}>
                {reminder.title}｜{reminder.activationCode}｜{formatDateTime(reminder.dueAt)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs font-medium text-slate-600">对应激活码</label>
          <Input value={form.activationCode} onChange={(event) => updateForm("activationCode", event.target.value)} placeholder="选择提醒后会自动填入，也可手动维护" />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700 md:min-h-0">
          <input
            type="checkbox"
            checked={form.isOtherAccount}
            onChange={(event) => updateForm("isOtherAccount", event.target.checked)}
          />
          是否他人账号
        </label>
        {selectedReminder ? (
          <p className="break-words text-xs text-slate-500 md:col-span-2 xl:col-span-3">
            当前关联：{selectedReminder.title}，提醒到期 {formatDateTime(selectedReminder.dueAt)}。
          </p>
        ) : null}
        <div className="grid gap-2 border-t border-slate-200 pt-3 sm:flex sm:flex-wrap md:col-span-2 xl:col-span-4">
          <Button className="min-h-11 w-full sm:w-auto" type="submit" disabled={saving}>{saving ? "保存中..." : editingId ? "保存修改" : "新增店铺账号"}</Button>
          {editingId ? (
            <Button type="button" className="min-h-11 w-full bg-slate-200 text-slate-700 hover:bg-slate-300 sm:w-auto" onClick={resetForm} disabled={saving}>
              取消编辑
            </Button>
          ) : null}
          <p className="min-h-5 break-words text-sm text-slate-500 sm:self-center">{message}</p>
        </div>
      </form>

      <div className="space-y-3 md:hidden">
        {items.map((item) => {
          const remainingDays = getRemainingDays(item.expiresAt);
          const isExpired = remainingDays !== null && remainingDays < 0;
          const isExpiringSoon = remainingDays !== null && remainingDays >= 0 && remainingDays <= 7;
          const credentialsRevealed = revealedCredentialIds.has(item.id);
          return (
            <article key={item.id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words font-semibold text-slate-900">{item.shopName}</h3>
                  <p className={isExpired ? "text-sm text-red-600" : isExpiringSoon ? "text-sm text-amber-600" : "text-sm text-slate-600"}>
                    {formatDateTime(item.expiresAt)}
                  </p>
                  {remainingDays !== null ? <p className="text-xs text-slate-500">{isExpired ? `已过期 ${Math.abs(remainingDays)} 天` : `剩余 ${remainingDays} 天`}</p> : null}
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{item.isOtherAccount ? "他人账号" : "自有账号"}</span>
              </div>
              <dl className="mt-4 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2 gap-y-2 text-sm">
                <dt className="text-slate-500">手机号</dt><dd className="break-all text-slate-800">{item.phone}</dd>
                <dt className="text-slate-500">远程码</dt><dd className="break-all text-slate-800">{credentialsRevealed ? item.remoteCode : "••••••••"}</dd>
                <dt className="text-slate-500">远程密码</dt>
                <dd className="flex min-w-0 items-start gap-2 font-mono text-slate-800">
                  <span className="min-w-0 flex-1 break-all">{credentialsRevealed ? item.remotePassword : "••••••••"}</span>
                  {credentialsRevealed ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-sans text-xs font-medium text-slate-700 hover:bg-slate-100"
                      aria-label={`复制${item.shopName}的远程密码`}
                      onClick={() => void copyRemotePassword(item)}
                    >
                      {copiedPasswordId === item.id ? "已复制" : "复制"}
                    </button>
                  ) : null}
                </dd>
                <dt className="text-slate-500">激活码</dt><dd className="break-all text-sky-700">{credentialsRevealed ? item.activationCode : "••••••••"}</dd>
                <dt className="text-slate-500">关联提醒</dt>
                <dd className="min-w-0 break-words">
                  {item.reminder ? <Link className="text-sky-600" href={`/reminders/${item.reminder.id}/edit`}>{item.reminder.title}</Link> : <span className="text-slate-400">未关联</span>}
                </dd>
              </dl>
              <button
                type="button"
                className="mt-3 flex min-h-11 w-full items-center justify-center rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                aria-expanded={credentialsRevealed}
                aria-label={`${credentialsRevealed ? "隐藏" : "显示"}${item.shopName}的远程密码和激活码`}
                onClick={() => toggleCredentialVisibility(item.id)}
              >
                {credentialsRevealed ? "隐藏凭据" : "显示凭据"}
              </button>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
                <Button
                  type="button"
                  className="col-span-2 min-h-11 bg-sky-100 text-sky-800 hover:bg-sky-200"
                  aria-expanded={qrAccountId === item.id}
                  onClick={() => setQrAccountId((current) => current === item.id ? null : item.id)}
                >
                  {qrAccountId === item.id ? "收起收款码" : "微信/支付宝收款码"}
                </Button>
                <Button type="button" className="min-h-11 bg-slate-100 text-slate-700 hover:bg-slate-200" onClick={() => startEditing(item)}>编辑</Button>
                <Button type="button" className="min-h-11 bg-red-600 hover:bg-red-700" disabled={deletingId === item.id} onClick={() => void handleDelete(item)}>
                  {deletingId === item.id ? "删除中" : "删除"}
                </Button>
              </div>
              {qrAccountId === item.id ? <div className="mt-3"><PaymentQrManager accountId={item.id} shopName={item.shopName} /></div> : null}
            </article>
          );
        })}
        {!loading && items.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">暂无店铺账号记录</div> : null}
        {loading ? <div className="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-500">加载中...</div> : null}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
        <table className="min-w-[1100px] w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">店铺名</th>
              <th className="px-3 py-3">手机号</th>
              <th className="px-3 py-3">远程码</th>
              <th className="px-3 py-3">远程密码（明文）</th>
              <th className="px-3 py-3">他人账号</th>
              <th className="px-3 py-3">到期时间</th>
              <th className="px-3 py-3">对应激活码</th>
              <th className="px-3 py-3">关联提醒</th>
              <th className="px-3 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {items.map((item) => {
              const remainingDays = getRemainingDays(item.expiresAt);
              const isExpired = remainingDays !== null && remainingDays < 0;
              const isExpiringSoon = remainingDays !== null && remainingDays >= 0 && remainingDays <= 7;
              return (
                <Fragment key={item.id}>
                <tr className="align-top hover:bg-slate-50">
                  <td className="px-3 py-3 font-medium text-slate-900">{item.shopName}</td>
                  <td className="px-3 py-3 text-slate-700">{item.phone}</td>
                  <td className="px-3 py-3 text-slate-700">{item.remoteCode}</td>
                  <td className="px-3 py-3 font-mono text-slate-700">
                    <div className="flex min-w-[130px] items-start gap-2">
                      <span className="min-w-0 flex-1 break-all">{item.remotePassword}</span>
                      <button
                        type="button"
                        className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-sans text-xs font-medium text-slate-700 hover:bg-slate-100"
                        aria-label={`复制${item.shopName}的远程密码`}
                        onClick={() => void copyRemotePassword(item)}
                      >
                        {copiedPasswordId === item.id ? "已复制" : "复制"}
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{item.isOtherAccount ? "是" : "否"}</td>
                  <td className="px-3 py-3">
                    <p className={isExpired ? "text-red-600" : isExpiringSoon ? "text-amber-600" : "text-slate-700"}>{formatDateTime(item.expiresAt)}</p>
                    {remainingDays !== null ? <p className="text-xs text-slate-500">{isExpired ? `已过期 ${Math.abs(remainingDays)} 天` : `剩余 ${remainingDays} 天`}</p> : null}
                  </td>
                  <td className="max-w-[180px] px-3 py-3 text-sky-700">
                    <p className="truncate" title={item.activationCode}>{item.activationCode}</p>
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {item.reminder ? (
                      <Link className="text-sky-600 hover:text-sky-800" href={`/reminders/${item.reminder.id}/edit`}>
                        {item.reminder.title}
                      </Link>
                    ) : (
                      <span className="text-slate-400">未关联</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        className="bg-sky-100 px-3 py-1.5 text-sky-800 hover:bg-sky-200"
                        aria-expanded={qrAccountId === item.id}
                        onClick={() => setQrAccountId((current) => current === item.id ? null : item.id)}
                      >
                        {qrAccountId === item.id ? "收起收款码" : "收款码"}
                      </Button>
                      <Button
                        type="button"
                        className="bg-slate-100 px-3 py-1.5 text-slate-700 hover:bg-slate-200"
                        onClick={() => startEditing(item)}
                      >
                        编辑
                      </Button>
                      <Button
                        type="button"
                        className="bg-red-600 px-3 py-1.5 hover:bg-red-700"
                        disabled={deletingId === item.id}
                        onClick={() => void handleDelete(item)}
                      >
                        {deletingId === item.id ? "删除中" : "删除"}
                      </Button>
                    </div>
                  </td>
                </tr>
                {qrAccountId === item.id ? (
                  <tr className="bg-sky-50/30">
                    <td colSpan={9} className="p-3 sm:p-4">
                      <PaymentQrManager accountId={item.id} shopName={item.shopName} />
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              );
            })}
            {!loading && items.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-slate-500" colSpan={9}>暂无店铺账号记录</td>
              </tr>
            ) : null}
            {loading ? (
              <tr>
                <td className="px-3 py-8 text-center text-slate-500" colSpan={9}>加载中...</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
