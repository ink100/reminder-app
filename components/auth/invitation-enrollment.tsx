"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useState } from "react";

export function InvitationEnrollment({ token }: { token: string }) {
  const [method, setMethod] = useState<"totp" | "passkey">("totp");
  const [setup, setSetup] = useState<{ secret: string; qrCodeDataUrl: string; enrollmentId: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function beginTotp() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/invite/${encodeURIComponent(token)}/totp/setup`, { method: "POST" });
      if (!response.ok) throw new Error();
      setSetup(await response.json());
    } catch { setMessage("邀请无效或已过期"); }
    finally { setBusy(false); }
  }

  async function verifyTotp() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/invite/${encodeURIComponent(token)}/totp/verify`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, enrollmentId: setup?.enrollmentId }),
      });
      if (!response.ok) throw new Error();
      window.location.replace("/reminders");
    } catch { setMessage("邀请无效或验证码错误"); setBusy(false); }
  }

  async function enrollPasskey() {
    setBusy(true); setMessage("");
    try {
      const optionsResponse = await fetch(`/api/invite/${encodeURIComponent(token)}/passkey/options`, { method: "POST" });
      if (!optionsResponse.ok) throw new Error();
      const credential = await startRegistration({ optionsJSON: await optionsResponse.json() });
      const verifyResponse = await fetch(`/api/invite/${encodeURIComponent(token)}/passkey/verify`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credential),
      });
      if (!verifyResponse.ok) throw new Error();
      window.location.replace("/reminders");
    } catch { setMessage("无法接受邀请，请重新打开邀请链接后再试"); setBusy(false); }
  }

  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
      <button className={`rounded-lg px-3 py-2 ${method === "totp" ? "bg-white shadow-sm" : ""}`} onClick={() => setMethod("totp")}>验证器</button>
      <button className={`rounded-lg px-3 py-2 ${method === "passkey" ? "bg-white shadow-sm" : ""}`} onClick={() => setMethod("passkey")}>通行密匙</button>
    </div>
    {method === "totp" ? <div className="space-y-4">
      {!setup ? <button disabled={busy} onClick={beginTotp} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-white disabled:opacity-50">生成独立验证密钥</button> : <>
        {/* QR and manual secret are rendered in the body only; neither is copied into a URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qrCodeDataUrl} alt="验证器二维码" className="mx-auto size-52" />
        <div className="rounded-lg bg-slate-100 p-3 text-center font-mono text-sm break-all">{setup.secret}</div>
        <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 位验证码" className="w-full rounded-lg border border-slate-300 px-4 py-3" />
        <button disabled={busy || code.length !== 6} onClick={verifyTotp} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-white disabled:opacity-50">验证并激活账户</button>
      </>}
    </div> : <button disabled={busy} onClick={enrollPasskey} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-white disabled:opacity-50">创建通行密匙并激活</button>}
    {message && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
  </div>;
}
