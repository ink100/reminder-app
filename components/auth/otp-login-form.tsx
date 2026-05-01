"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isOtpCodeComplete, normalizeOtpCode } from "@/lib/otp-input";

type OtpLoginFormProps = {
  redirectTo?: string;
};

export function OtpLoginForm({ redirectTo = "/inventory" }: OtpLoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nextPath = searchParams.get("next") || redirectTo;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isOtpCodeComplete(code)) {
      setMessage("请输入 6 位数字验证码");
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/otp/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ code }),
      });

      const data = (await response.json()) as { error?: string; success?: boolean };

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "登录失败");
      }

      router.push(nextPath);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      onSubmit={handleSubmit}
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-950">OTP 登录</h2>
        <p className="mt-1 text-sm text-slate-500">
          请输入 Google Authenticator / GitHub Mobile 中当前显示的 6 位动态验证码。
        </p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">6 位动态验证码</label>
        <Input
          inputMode="numeric"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(event) => {
            setCode(normalizeOtpCode(event.target.value));
            if (message) {
              setMessage(null);
            }
          }}
          required
        />
      </div>
      {message ? <p className="text-sm text-rose-600">{message}</p> : null}
      <Button className="w-full" type="submit" disabled={submitting || !isOtpCodeComplete(code)}>
        {submitting ? "验证中…" : "登录"}
      </Button>
    </form>
  );
}
