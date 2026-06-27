"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

import { OtpLoginForm } from "@/components/auth/otp-login-form";
import { OtpSetupCard } from "@/components/auth/otp-setup-card";
import { PasskeyLogin } from "@/components/auth/passkey-login";

type AuthEntryProps = {
  otpConfigured: boolean;
  hasPasskeyCredentials: boolean;
  redirectTo?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
};

type LoginMethod = "otp" | "passkey";

export function AuthEntry({
  otpConfigured,
  hasPasskeyCredentials,
  redirectTo = "/reminders",
  eyebrow = "库存通知登录",
  title = "进入库存通知页前先做 OTP 验证",
  description = "如果后台还没有配置 OTP 密钥，首次进入将显示二维码完成绑定；配置完成后，每次访问都要输入一次动态验证码，避免其他人直接进入库存通知页面。",
}: AuthEntryProps) {
  const [method, setMethod] = useState<LoginMethod>(
    hasPasskeyCredentials ? "passkey" : "otp"
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl items-center justify-center px-4 py-6 md:py-10 md:px-6">
      <div className="flex w-full flex-col gap-6 md:flex-row md:gap-8">
        {/* Description — hidden on mobile to save space */}
        <section className="hidden flex-col justify-center rounded-2xl bg-slate-950 p-6 text-white shadow-xl md:flex md:w-[55%] md:rounded-3xl md:p-8">
          <p className="text-sm font-semibold uppercase text-slate-300">{eyebrow}</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-balance">{title}</h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-pretty text-slate-300">{description}</p>
        </section>

        {/* Login — full width on mobile */}
        <section className="flex w-full flex-col gap-5 md:w-[45%]">
          {/* Compact title for mobile */}
          <div className="md:hidden">
            <p className="text-xs font-semibold uppercase text-slate-400">{eyebrow}</p>
            <h1 className="mt-1 text-lg font-semibold text-balance text-slate-900">{title}</h1>
          </div>

          {/* Toggle */}
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMethod("passkey")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                method === "passkey"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 active:bg-white/50"
              )}
            >
              <svg className="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              通行密匙
            </button>
            <button
              type="button"
              onClick={() => setMethod("otp")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                method === "otp"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 active:bg-white/50"
              )}
            >
              <svg className="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              OTP 验证码
            </button>
          </div>

          {/* Form */}
          {method === "passkey" ? (
            <div className="space-y-4">
              <PasskeyLogin redirectTo={redirectTo} />
              {!hasPasskeyCredentials && (
                <p className="text-center text-xs text-pretty text-slate-500">
                  还没有通行密匙？登录后可在设置中添加。
                </p>
              )}
            </div>
          ) : otpConfigured ? (
            <OtpLoginForm redirectTo={redirectTo} />
          ) : (
            <OtpSetupCard redirectTo={redirectTo} />
          )}
        </section>
      </div>
    </main>
  );
}
