"use client";

import { useState, useEffect, useCallback } from "react";
import { PasskeyRegister } from "@/components/auth/passkey-register";

type Credential = {
  id: string;
  credentialId: string;
  deviceName: string | null;
  authenticatorType: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export function PasskeyManager() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/passkey/list");
      if (res.ok) {
        const data = await res.json();
        setCredentials(data.items);
      }
    } catch (error) {
      console.error("获取凭证列表失败:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchCredentials);
  }, [fetchCredentials]);

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个通行密匙吗？")) return;

    try {
      const res = await fetch(`/api/auth/passkey/${id}`, { method: "DELETE" });
      if (res.ok) {
        setCredentials((prev) => prev.filter((c) => c.id !== id));
      }
    } catch (error) {
      console.error("删除失败:", error);
    }
  };

  const handleRegisterSuccess = () => {
    setShowRegister(false);
    fetchCredentials();
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "从未使用";
    const date = new Date(dateStr);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">通行密匙管理</h2>
          <p className="mt-1 text-sm text-slate-500">
            使用生物识别或安全密钥进行免密码登录。
          </p>
        </div>
        <button
          onClick={() => setShowRegister(!showRegister)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {showRegister ? "取消" : "+ 添加通行密匙"}
        </button>
      </div>

      {/* 注册表单 */}
      {showRegister && (
        <div className="mb-6">
          <PasskeyRegister
            onSuccess={handleRegisterSuccess}
            onError={(error) => console.error(error)}
          />
        </div>
      )}

      {/* 凭证列表 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
        </div>
      ) : credentials.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <svg
            className="mx-auto h-12 w-12 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
            />
          </svg>
          <p className="mt-3 text-sm text-slate-600">还没有通行密匙</p>
          <p className="mt-1 text-xs text-slate-500">
            点击上方按钮添加一个通行密匙，体验无密码登录。
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {credentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                  {cred.authenticatorType === "platform" ? (
                    <svg className="h-5 w-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {cred.deviceName || "通行密匙"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {cred.authenticatorType === "platform" ? "设备内置" : "外部密钥"} · 
                    添加于 {formatDate(cred.createdAt)} · 
                    最后使用 {formatDate(cred.lastUsedAt)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDelete(cred.id)}
                className="rounded-lg px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
