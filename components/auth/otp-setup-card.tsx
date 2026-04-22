"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isOtpCodeComplete, normalizeOtpCode } from "@/lib/otp-input";

type SetupPayload = {
  secret: string;
  qrCodeDataUrl: string;
};

export function OtpSetupCard() {
  const router = useRouter();
  const [payload, setPayload] = useState<SetupPayload | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSetupPayload() {
      setLoading(true);
      setMessage(null);

      try {
        const response = await fetch("/api/auth/otp/setup", { method: "POST" });
        const data = (await response.json()) as { error?: string } & Partial<SetupPayload>;

        if (!response.ok) {
          throw new Error(data.error ?? "初始化 OTP 失败");
        }

        if (!data.secret || !data.qrCodeDataUrl) {
          throw new Error("OTP 初始化返回数据不完整");
        }

        if (!cancelled) {
          setPayload({
            secret: data.secret,
            qrCodeDataUrl: data.qrCodeDataUrl,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "初始化 OTP 失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSetupPayload();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isOtpCodeComplete(code)) {
      setMessage("请输入 6 位数字验证码");
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/otp/verify-setup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ code }),
      });

      const data = (await response.json()) as { error?: string; success?: boolean };

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "OTP 验证失败");
      }

      router.push("/reminders");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "OTP 验证失败");
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
        <h2 className="text-lg font-semibold text-slate-950">首次绑定 OTP</h2>
        <p className="mt-1 text-sm text-slate-500">
          使用 Google Authenticator、GitHub Mobile 或其他 TOTP 应用扫码后输入 6 位验证码。
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">正在生成 OTP 二维码…</div>
      ) : payload ? (
        <>
          <div className="flex justify-center rounded-xl bg-slate-50 p-4">
            <Image alt="OTP QR Code" height={180} src={payload.qrCodeDataUrl} width={180} />
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            手动密钥：<span className="font-mono">{payload.secret}</span>
          </div>
        </>
      ) : null}

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">6 位验证码</label>
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

      <Button className="w-full" type="submit" disabled={loading || submitting || !payload || !isOtpCodeComplete(code)}>
        {submitting ? "验证中…" : "完成绑定"}
      </Button>
    </form>
  );
}
