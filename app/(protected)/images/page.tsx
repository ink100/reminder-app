"use client";

import { useState, useEffect, useCallback } from "react";
import { FileUploader } from "@/components/images/image-uploader";
import { FileGallery } from "@/components/images/image-gallery";

interface FileData {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  createdAt: string;
  reminderId?: string | null;
  reminderTitle?: string | null;
}

type TabType = "images" | "attachments";

export default function ImagesPage() {
  const [activeTab, setActiveTab] = useState<TabType>("images");
  const [files, setFiles] = useState<FileData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "image" | "file">("all");
  const [isLoading, setIsLoading] = useState(true);

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: "20",
        search,
        type: typeFilter,
      });

      const endpoint = activeTab === "images" ? "/api/images" : `/api/attachments?${params}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } catch (err) {
      console.error("加载失败:", err);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, typeFilter, activeTab]);

  useEffect(() => {
    void Promise.resolve().then(fetchFiles);
  }, [fetchFiles]);

  const handleUploadSuccess = (file: FileData) => {
    if (activeTab === "images") {
      if (typeFilter === "all" ||
        (typeFilter === "image" && file.mimetype.startsWith("image/")) ||
        (typeFilter === "file" && !file.mimetype.startsWith("image/"))) {
        setFiles((prev) => [file, ...prev]);
      }
      setTotal((prev) => prev + 1);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个文件吗？")) return;

    try {
      const endpoint = activeTab === "images" ? `/api/images/${id}` : `/api/attachments/${id}`;
      const res = await fetch(endpoint, { method: "DELETE" });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== id));
        setTotal((prev) => prev - 1);
      }
    } catch (err) {
      console.error("删除失败:", err);
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setPage(1);
    setSearch("");
    setTypeFilter("all");
    setFiles([]);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">文件管理</h1>
          <p className="mt-1 text-sm text-slate-500">
            共 {total} 个文件 · 上传到 Cloudflare R2
          </p>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex rounded-lg border border-slate-200 overflow-hidden">
        <button
          onClick={() => handleTabChange("images")}
          className={`px-6 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "images"
              ? "bg-blue-500 text-white"
              : "bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          🖼️ 图床文件
        </button>
        <button
          onClick={() => handleTabChange("attachments")}
          className={`px-6 py-2.5 text-sm font-medium border-l border-slate-200 transition-colors ${
            activeTab === "attachments"
              ? "bg-blue-500 text-white"
              : "bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          📎 提醒附件
        </button>
      </div>

      {/* 上传区域 - 仅图床文件 tab 显示 */}
      {activeTab === "images" && (
        <FileUploader onUploadSuccess={handleUploadSuccess} />
      )}

      {/* 搜索和筛选 */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="搜索文件名..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          <button
            onClick={() => { setTypeFilter("all"); setPage(1); }}
            className={`px-4 py-2 text-sm ${typeFilter === "all" ? "bg-blue-500 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            全部
          </button>
          <button
            onClick={() => { setTypeFilter("image"); setPage(1); }}
            className={`px-4 py-2 text-sm border-l border-slate-200 ${typeFilter === "image" ? "bg-blue-500 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            图片
          </button>
          <button
            onClick={() => { setTypeFilter("file"); setPage(1); }}
            className={`px-4 py-2 text-sm border-l border-slate-200 ${typeFilter === "file" ? "bg-blue-500 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            文件
          </button>
        </div>
      </div>

      {/* 文件列表 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : (
        <FileGallery
          files={files}
          onDelete={handleDelete}
          showSource={activeTab === "attachments"}
        />
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            上一页
          </button>
          <span className="text-sm text-slate-600">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
