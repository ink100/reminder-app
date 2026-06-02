"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type TrustedDevice = {
  id: string;
  deviceName: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: string;
  lastUsedAt: string | null;
  createdAt: string;
};

function formatDate(value: string | null) {
  if (!value) return "从未使用";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function shortUserAgent(userAgent: string | null) {
  if (!userAgent) return "未知浏览器";
  if (userAgent.includes("Edg/")) return "Microsoft Edge";
  if (userAgent.includes("Chrome/")) return "Chrome / Chromium";
  if (userAgent.includes("Firefox/")) return "Firefox";
  if (userAgent.includes("Safari/") && !userAgent.includes("Chrome/")) return "Safari";
  return userAgent.slice(0, 72);
}

export function TrustedDevicesCard() {
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const activeCount = useMemo(() => devices.length, [devices]);

  async function loadDevices() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/trusted/devices");
      const data = (await response.json()) as { devices?: TrustedDevice[]; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "加载可信设备失败");
      }

      setDevices(data.devices ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载可信设备失败");
    } finally {
      setLoading(false);
    }
  }

  async function revokeDevice(id: string) {
    setRevokingId(id);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/trusted/devices", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "撤销失败");
      }

      setDevices((items) => items.filter((item) => item.id !== id));
      setMessage("已撤销该可信设备");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "撤销失败");
    } finally {
      setRevokingId(null);
    }
  }

  useEffect(() => {
    void loadDevices();
  }, []);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-600">Trusted Devices</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">可信设备</h2>
          <p className="mt-1 text-sm text-slate-500">
            勾选“信任这台设备”登录后，30 天内可自动恢复登录。敏感操作仍建议重新验证。
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          {activeCount} 台有效
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            正在加载可信设备…
          </div>
        ) : devices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            暂无可信设备。下次登录时勾选“信任这台设备”即可添加。
          </div>
        ) : (
          devices.map((device) => (
            <div
              key={device.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900">{device.deviceName ?? "可信设备"}</p>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    有效
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{shortUserAgent(device.userAgent)}</p>
                <p className="mt-1 text-xs text-slate-400">
                  最近使用：{formatDate(device.lastUsedAt)} · 到期：{formatDate(device.expiresAt)}
                </p>
              </div>
              <Button
                type="button"
                className="border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                disabled={revokingId === device.id}
                onClick={() => revokeDevice(device.id)}
              >
                {revokingId === device.id ? "撤销中…" : "撤销"}
              </Button>
            </div>
          ))
        )}
      </div>

      {message ? <p className="mt-4 text-sm text-slate-500">{message}</p> : null}
    </section>
  );
}
