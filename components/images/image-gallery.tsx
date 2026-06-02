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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {files.map((file) => (
        <div
          key={file.id}
          className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white transition-all hover:shadow-md"
        >
          {/* 预览区 */}
          <div className="aspect-square overflow-hidden bg-slate-50 flex items-center justify-center">
            {isImage(file.mimetype) ? (
              <img
                src={file.url}
                alt={file.originalName}
                className="h-full w-full object-cover"
                loading="lazy"
              />
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
            {showSource && file.reminderTitle && (
              <p className="mt-1 truncate text-xs text-blue-500" title={file.reminderTitle}>
                📋 {file.reminderTitle}
              </p>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyLink(file);
              }}
              className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
            >
              {copiedId === file.id ? "✓ 已复制" : "复制链接"}
            </button>
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white"
            >
              下载
            </a>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(file.id);
              }}
              className="rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
            >
              删除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
