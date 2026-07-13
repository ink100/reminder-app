"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isOtpCodeComplete, normalizeOtpCode } from "@/lib/otp-input";

type OtpLoginFormProps = {
  redirectTo?: string;
};

export function OtpLoginForm({ redirectTo = "/reminders" }: OtpLoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [rememberDevice, setRememberDevice] = useState(true);
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
        body: JSON.stringify({ code, rememberDevice }),
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
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-[360px]:p-5 md:p-6"
      onSubmit={handleSubmit}
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-950">OTP 登录</h2>
        <p className="mt-1 text-sm text-slate-500">
          请输入 Google Authenticator / GitHub Mobile 中当前显示的 6 位动态验证码。
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="otp-login-code" className="text-sm font-medium text-slate-700">6 位动态验证码</label>
        <Input
          id="otp-login-code"
          name="code"
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]*"
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
      <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          checked={rememberDevice}
          onChange={(event) => setRememberDevice(event.target.checked)}
        />
        <span>
          <span className="font-medium text-slate-800">信任这台设备 30 天</span>
          <span className="block text-xs text-slate-500">之后在这台设备上可自动恢复登录，可在设置中撤销。</span>
        </span>
      </label>
      {message ? <p className="text-sm text-rose-600">{message}</p> : null}
      <Button className="w-full" type="submit" disabled={submitting || !isOtpCodeComplete(code)}>
        {submitting ? "验证中…" : "登录"}
      </Button>
    </form>
  );
}
