"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  startAuthentication,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";

type PasskeyLoginProps = {
  redirectTo?: string;
};

type LoginMode = "platform" | "hybrid";

function getFriendlyError(error: unknown, mode: LoginMode) {
  if (!(error instanceof Error)) return "登录失败";

  if (error.name === "NotAllowedError" || error.message.includes("not allowed")) {
    return mode === "hybrid"
      ? "未完成手机扫码验证，或验证窗口已超时。请重新点击“手机扫码登录”。"
      : "未完成本机验证。如果 Edge 没有可用通行密匙，请改用“手机扫码登录”。";
  }

  if (error.name === "SecurityError") {
    return "通行密匙域名校验失败，请确认使用 https://ne.daydreams.cn 访问，不要用 IP 或其它域名。";
  }

  if (error.name === "AbortError") {
    return "验证已取消，请重试。";
  }

  return error.message || "登录失败";
}

export function PasskeyLogin({ redirectTo = "/reminders" }: PasskeyLoginProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [loadingMode, setLoadingMode] = useState<LoginMode | null>(null);
  const [message, setMessage] = useState<string>("");
  const [rememberDevice, setRememberDevice] = useState(true);

  const isSupported = browserSupportsWebAuthn();

  async function handleLogin(mode: LoginMode) {
    if (!isSupported) {
      setMessage("您的浏览器不支持通行密匙");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setLoadingMode(mode);
    setMessage(mode === "hybrid" ? "正在准备手机扫码登录..." : "正在准备本机通行密匙...");

    try {
      const optionsRes = await fetch(`/api/auth/passkey/login?mode=${mode}`);
      if (!optionsRes.ok) {
        const errorData = await optionsRes.json().catch(() => null) as { error?: string } | null;
        throw new Error(errorData?.error || "获取认证选项失败");
      }
      const options = await optionsRes.json();

      setMessage(mode === "hybrid" ? "请在 Edge 弹窗中选择手机/扫码完成验证..." : "请完成本机验证...");
      const credential = await startAuthentication({ optionsJSON: options });

      setMessage("正在验证...");
      const verifyRes = await fetch("/api/auth/passkey/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...credential, rememberDevice }),
      });

      const result = await verifyRes.json();

      if (!verifyRes.ok || !result.verified) {
        throw new Error(result.error || "登录失败");
      }

      router.push(redirectTo);
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(getFriendlyError(error, mode));
    } finally {
      setLoadingMode(null);
    }
  }

  if (!isSupported) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-800">
          ⚠️ 您的浏览器不支持通行密匙（WebAuthn）。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          onClick={() => handleLogin("platform")}
          disabled={loadingMode !== null}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
        >
          {loadingMode === "platform" ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          )}
          本机登录
        </button>

        <button
          onClick={() => handleLogin("hybrid")}
          disabled={loadingMode !== null}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700 disabled:opacity-50"
        >
          {loadingMode === "hybrid" ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          )}
          手机扫码登录
        </button>
      </div>

      <p className="text-center text-xs text-slate-500">
        Edge 无法直接唤起时，请点“手机扫码登录”。
      </p>

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

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            status === "error"
              ? "border border-red-200 bg-red-50 text-red-800"
              : "border border-blue-200 bg-blue-50 text-blue-800"
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}
