"use client";

import { useState } from "react";

type R2SettingsProps = {
  initialValues: {
    r2Endpoint: string;
    r2AccessKey: string;
    r2SecretKey: string;
    r2Bucket: string;
    r2PublicUrl: string;
    r2CacheControl: string;
  };
};

export function R2SettingsCard({ initialValues }: R2SettingsProps) {
  const [endpoint, setEndpoint] = useState(initialValues.r2Endpoint);
  const [accessKey, setAccessKey] = useState(initialValues.r2AccessKey);
  const [secretKey, setSecretKey] = useState(initialValues.r2SecretKey);
  const [bucket, setBucket] = useState(initialValues.r2Bucket);
  const [publicUrl, setPublicUrl] = useState(initialValues.r2PublicUrl);
  const [cacheControl, setCacheControl] = useState(initialValues.r2CacheControl);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleTest() {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/r2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, accessKey, secretKey, bucket }),
      });
      const data = await res.json();
      setMessage(data.success ? "✅ " + data.message : "❌ " + data.message);
    } catch {
      setMessage("❌ 测试失败");
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/r2", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, accessKey, secretKey, bucket, publicUrl, cacheControl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setMessage("✅ 配置已保存");
    } catch (error) {
      setMessage("❌ " + (error instanceof Error ? error.message : "保存失败"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-950">图床存储配置（R2）</h2>
      <p className="mt-1 text-sm text-slate-500">配置 Cloudflare R2 对象存储，用于文件上传和图床功能。</p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="text-sm font-medium text-slate-700">Endpoint</label>
          <input className="mt-1 min-h-11 w-full rounded-md border border-slate-200 px-3 py-2 text-sm md:min-h-0" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://xxx.r2.cloudflarestorage.com" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">Access Key ID</label>
            <input className="mt-1 min-h-11 w-full rounded-md border border-slate-200 px-3 py-2 text-sm md:min-h-0" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} placeholder="R2 Access Key" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Secret Access Key</label>
            <input type="password" className="mt-1 min-h-11 w-full rounded-md border border-slate-200 px-3 py-2 text-sm md:min-h-0" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="R2 Secret Key" />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">Bucket</label>
            <input className="mt-1 min-h-11 w-full rounded-md border border-slate-200 px-3 py-2 text-sm md:min-h-0" value={bucket} onChange={(e) => setBucket(e.target.value)} placeholder="storage-r2-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">公开访问域名</label>
            <input className="mt-1 min-h-11 w-full rounded-md border border-slate-200 px-3 py-2 text-sm md:min-h-0" value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder="https://img.daydreams.cn" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Cache-Control</label>
          <input className="mt-1 min-h-11 w-full rounded-md border border-slate-200 px-3 py-2 text-sm md:min-h-0" value={cacheControl} onChange={(e) => setCacheControl(e.target.value)} placeholder="public, max-age=86400" />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button onClick={handleTest} disabled={testing} className="min-h-11 w-full rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 sm:w-auto md:min-h-0">
          {testing ? "测试中..." : "测试连接"}
        </button>
        <button onClick={handleSave} disabled={saving} className="min-h-11 w-full rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50 sm:w-auto md:min-h-0">
          {saving ? "保存中..." : "保存配置"}
        </button>
        {message && <span className="break-words text-sm">{message}</span>}
      </div>
    </div>
  );
}
