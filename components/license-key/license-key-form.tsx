"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeClientKey, getLicenseFileNameFromContentDisposition } from "@/lib/license-key";

function getInitialValidDays(value: string | null) {
  const days = Number(value);
  return Number.isInteger(days) && days > 0 ? String(days) : "7";
}

type LicenseKeyFormProps = {
  initialClientKey?: string;
  reminderId?: string;
  initialValidDays?: string;
};

export function LicenseKeyForm({ initialClientKey = "", reminderId = "", initialValidDays }: LicenseKeyFormProps) {
  const [clientKey, setClientKey] = useState(initialClientKey);
  const [validDays, setValidDays] = useState(getInitialValidDays(initialValidDays ?? null));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [download, setDownload] = useState<{ url: string; fileName: string } | null>(null);

  const isLinkedReminder = useMemo(() => Boolean(reminderId), [reminderId]);

  useEffect(() => {
    return () => {
      if (download?.url) {
        URL.revokeObjectURL(download.url);
      }
    };
  }, [download]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = {
      clientKey: normalizeClientKey(clientKey),
      validDays: Number(validDays),
      reminderId: reminderId || undefined,
    };

    if (!payload.clientKey || payload.validDays <= 0) {
      setMessage("请填写激活码和有效天数");
      return;
    }

    setSubmitting(true);
    setMessage("生成中...");
    setDownload((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });

    try {
      const response = await fetch("/api/license/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(error?.error ?? "生成失败");
      }

      const blob = await response.blob();
      const fileName = getLicenseFileNameFromContentDisposition(response.headers.get("content-disposition"));
      const linkedDueAt = response.headers.get("x-linked-reminder-due-at");
      const url = URL.createObjectURL(blob);
      setDownload({ url, fileName });

      // 部分移动端/Telegram 内置浏览器会拦截异步生成后的自动下载，所以下方仍保留一个显式下载按钮兜底。
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();

      setMessage(
        linkedDueAt
          ? `授权文件已生成，并已同步关联提醒的倒计时到 ${new Date(linkedDueAt).toLocaleString("zh-CN")}。`
          : "授权文件已生成。如果没有自动下载，请点击下方下载按钮。",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6" onSubmit={handleSubmit}>
      {isLinkedReminder ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          已关联提醒：本次生成成功后，会用“有效天数”自动更新该提醒的到期倒计时。
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">激活码 / Client Key</label>
        <textarea
          className="min-h-40 w-full resize-y break-all rounded-md border border-slate-200 px-3 py-2 text-sm outline-none"
          value={clientKey}
          onChange={(event) => setClientKey(event.target.value)}
          placeholder="请输入客户端提供的激活码 / Client Key"
        />
      </div>

      <div className="space-y-2 md:max-w-xs">
        <label className="text-sm font-medium text-slate-700">有效天数</label>
        <Input type="number" min={1} value={validDays} onChange={(event) => setValidDays(event.target.value)} />
        {isLinkedReminder ? (
          <p className="text-xs text-slate-500">已从提醒倒计时自动带入；如需调整，生成后会同步更新提醒到期时间。</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <p className="min-h-5 min-w-0 break-words text-sm text-slate-500">
          {message ?? "激活码和 Client Key 按同一个字段处理；当前生成密匙暂不需要 OTP 验证码。"}
        </p>
        <Button className="min-h-11 w-full sm:w-auto" type="submit" disabled={submitting}>{submitting ? "生成中..." : "生成 .key 文件"}</Button>
      </div>

      {download && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <p className="mb-2 break-all font-medium">文件已生成：{download.fileName}</p>
          <a
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-emerald-600 px-3 py-2 text-white hover:bg-emerald-700 sm:w-auto"
            href={download.url}
            download={download.fileName}
          >
            下载授权 .key 文件
          </a>
        </div>
      )}
    </form>
  );
}
