"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeClientKey } from "@/lib/license-key";

export function LicenseKeyForm() {
  const searchParams = useSearchParams();
  const initialClientKey = searchParams.get("clientKey") ?? searchParams.get("activationCode") ?? "";
  const [clientKey, setClientKey] = useState(initialClientKey);
  const [validDays, setValidDays] = useState("7");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = {
      clientKey: normalizeClientKey(clientKey),
      validDays: Number(validDays),
    };

    if (!payload.clientKey || payload.validDays <= 0) {
      setMessage("请填写激活码和有效天数");
      return;
    }

    setSubmitting(true);
    setMessage("生成中...");

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
      const disposition = response.headers.get("content-disposition") ?? "";
      const fileNameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      const fileName = fileNameMatch?.[1] ?? fileNameMatch?.[2] ?? `license_${Date.now()}.key`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = decodeURIComponent(fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("授权文件已生成并开始下载");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-4 rounded-xl border border-slate-200 bg-white p-6" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">激活码 / Client Key</label>
        <textarea
          className="min-h-40 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none"
          value={clientKey}
          onChange={(event) => setClientKey(event.target.value)}
          placeholder="请输入客户端提供的激活码 / Client Key"
        />
      </div>

      <div className="space-y-2 md:max-w-xs">
        <label className="text-sm font-medium text-slate-700">有效天数</label>
        <Input type="number" min={1} value={validDays} onChange={(event) => setValidDays(event.target.value)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="min-h-5 text-sm text-slate-500">
          {message ?? "激活码和 Client Key 按同一个字段处理；当前生成密匙暂不需要 OTP 验证码。"}
        </p>
        <Button type="submit" disabled={submitting}>{submitting ? "生成中..." : "生成 .key 文件"}</Button>
      </div>
    </form>
  );
}
