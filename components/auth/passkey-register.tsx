"use client";

import { useState } from "react";
import {
  startRegistration,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";

type PasskeyRegisterProps = {
  onSuccess?: () => void;
  onError?: (error: string) => void;
};

export function PasskeyRegister({ onSuccess, onError }: PasskeyRegisterProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  const isSupported = browserSupportsWebAuthn();

  async function handleRegister(type: "platform" | "cross-platform") {
    if (!isSupported) {
      setMessage("您的浏览器不支持通行密匙");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setMessage(type === "platform" ? "正在调用 Windows Hello..." : "正在准备扫码...");

    try {
      // 1. 从服务器获取注册选项
      const optionsRes = await fetch(`/api/auth/passkey/register?type=${type}`);
      if (!optionsRes.ok) {
        throw new Error("获取注册选项失败");
      }
      const options = await optionsRes.json();

      // 2. 调用浏览器 WebAuthn API
      setMessage(type === "platform" ? "请完成设备验证..." : "请用手机扫描二维码...");
      const credential = await startRegistration({ optionsJSON: options });

      // 3. 发送到服务器验证
      setMessage("正在验证...");
      const verifyRes = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credential),
      });

      const result = await verifyRes.json();

      if (!verifyRes.ok || !result.verified) {
        throw new Error(result.error || "注册失败");
      }

      setStatus("success");
      setMessage("通行密匙注册成功！");
      onSuccess?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "注册失败";
      setStatus("error");
      setMessage(errorMessage);
      onError?.(errorMessage);
    }
  }

  if (!isSupported) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-800">
          ⚠️ 您的浏览器不支持通行密匙（WebAuthn）。
          <br />
          请使用 Chrome、Safari、Edge 或 Firefox 等现代浏览器。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-medium text-slate-900">注册通行密匙</h3>
        <p className="mt-1 text-xs text-slate-500">
          选择一种验证方式来添加通行密匙。
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => handleRegister("platform")}
            disabled={status === "loading"}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {status === "loading" ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            )}
            本机验证
          </button>
          <button
            onClick={() => handleRegister("cross-platform")}
            disabled={status === "loading"}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {status === "loading" ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            )}
            手机扫码
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            status === "success"
              ? "border border-green-200 bg-green-50 text-green-800"
              : status === "error"
              ? "border border-red-200 bg-red-50 text-red-800"
              : "border border-blue-200 bg-blue-50 text-blue-800"
          }`}
        >
          {status === "success" && "✅ "}
          {status === "error" && "❌ "}
          {message}
        </div>
      )}
    </div>
  );
}
