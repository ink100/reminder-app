"use client";

import { useState } from "react";

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
  attachmentType?: string | null;
  licenseStoreAccountId?: string | null;
  sourceLabel?: string | null;
}

interface FileGalleryProps {
  files: FileData[];
  onDelete: (id: string) => void;
  showSource?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getFileIcon(mimetype: string, name: string): string {
  if (mimetype.startsWith("image/")) return "🖼️";
  if (mimetype.startsWith("video/")) return "🎬";
  if (mimetype.startsWith("audio/")) return "🎵";
  if (mimetype.includes("pdf")) return "📄";
  if (mimetype.includes("zip") || mimetype.includes("rar") || mimetype.includes("7z") || mimetype.includes("tar")) return "📦";
  if (mimetype.includes("word") || name.endsWith(".doc") || name.endsWith(".docx")) return "📝";
  if (mimetype.includes("excel") || mimetype.includes("spreadsheet") || name.endsWith(".xls") || name.endsWith(".xlsx")) return "📊";
  if (mimetype.includes("powerpoint") || name.endsWith(".ppt") || name.endsWith(".pptx")) return "📽️";
  if (mimetype.includes("text") || name.endsWith(".txt") || name.endsWith(".md")) return "📃";
  if (mimetype.includes("json") || name.endsWith(".json")) return "🔧";
  if (mimetype.includes("javascript") || mimetype.includes("typescript") || name.endsWith(".js") || name.endsWith(".ts")) return "⚡";
  if (name.endsWith(".exe") || name.endsWith(".msi") || name.endsWith(".dmg")) return "💿";
  return "📎";
}

function isImage(mimetype: string): boolean {
  return mimetype.startsWith("image/");
}

export function FileGallery({ files, onDelete, showSource = false }: FileGalleryProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileData | null>(null);

  const copyLink = async (file: FileData) => {
    try {
      await navigator.clipboard.writeText(file.url);
      setCopiedId(file.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = file.url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedId(file.id);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <svg
          className="mb-4 h-16 w-16"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
        <p className="text-sm">还没有文件</p>
        <p className="mt-1 text-xs">上传第一个文件吧</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
      {files.map((file) => (
        <div
          key={file.id}
          className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white transition-all hover:shadow-md"
        >
          {/* 预览区 */}
          <div className="aspect-square overflow-hidden bg-slate-50 flex items-center justify-center">
            {isImage(file.mimetype) ? (
              <button
                type="button"
                onClick={() => setPreviewFile(file)}
                className="h-full w-full cursor-zoom-in"
                aria-label="预览图片"
                title="预览图片"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={file.url}
                  alt={file.originalName}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              </button>
            ) : (
              <span className="text-5xl">{getFileIcon(file.mimetype, file.originalName)}</span>
            )}
          </div>

          {/* 信息区 */}
          <div className="p-3">
            <p
              className="truncate text-xs font-medium text-slate-700"
              title={file.originalName}
            >
              {file.originalName}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {formatSize(file.size)} · {formatDate(file.createdAt)}
            </p>
            {/* 来源标签 */}
            {showSource && file.sourceLabel && (
              <p className="mt-1 truncate text-xs text-blue-500" title={file.sourceLabel}>
                📋 {file.sourceLabel}
              </p>
            )}
          </div>

          {/* 底部操作按钮 */}
          <div className="grid grid-cols-3 gap-2 border-t border-slate-100 px-3 pb-3 text-center text-xs">
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyLink(file);
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-50 px-2 py-1.5 font-medium text-blue-600 hover:bg-blue-100 sm:min-h-9"
            >
              {copiedId === file.id ? "已复制" : "复制"}
            </button>
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-50 px-2 py-1.5 font-medium text-slate-600 hover:bg-slate-100 sm:min-h-9"
            >
              下载
            </a>
            {file.licenseStoreAccountId ? (
              <span className="inline-flex min-h-11 items-center justify-center rounded-md bg-sky-50 px-2 py-1.5 font-medium text-sky-600 sm:min-h-9">
                店铺管理
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(file.id);
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-red-50 px-2 py-1.5 font-medium text-red-500 hover:bg-red-100 sm:min-h-9"
              >
                删除
              </button>
            )}
          </div>
        </div>
      ))}
      </div>

      {previewFile ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
          onClick={() => setPreviewFile(null)}
        >
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl sm:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{previewFile.originalName}</p>
                <p className="text-xs text-slate-500">{formatSize(previewFile.size)} · {formatDate(previewFile.createdAt)}</p>
              </div>
              <button
                type="button"
                className="inline-flex min-h-11 shrink-0 items-center rounded-md px-3 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setPreviewFile(null)}
              >
                关闭
              </button>
            </div>
            <div className="flex max-h-[75vh] items-center justify-center bg-slate-950 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewFile.url}
                alt={previewFile.originalName}
                className="max-h-[72vh] max-w-full rounded object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
