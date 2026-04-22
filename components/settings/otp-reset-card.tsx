"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OtpResetCard() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleReset() {
    const confirmed = window.confirm("确认重置 OTP 吗？此操作会让所有会话立即失效。");
    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/otp/reset", {
        method: "POST",
      });
      const data = (await response.json()) as { error?: string; success?: boolean };

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "重置 OTP 失败");
      }

      router.push("/auth");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重置 OTP 失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50 p-6">
      <h3 className="text-lg font-semibold text-rose-900">重置 OTP</h3>
      <p className="mt-2 text-sm text-rose-800">这是高风险操作，会清空 OTP 配置并让全部会话失效。</p>
      {message ? <p className="mt-2 text-sm text-rose-700">{message}</p> : null}
      <button
        className="mt-4 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        type="button"
        onClick={handleReset}
        disabled={submitting}
      >
        {submitting ? "重置中..." : "重置 OTP"}
      </button>
    </section>
  );
}
