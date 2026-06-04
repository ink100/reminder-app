"use client";

import { useState, useRef } from "react";

type Attachment = {
  id: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  createdAt: string;
};

type FileUploadProps = {
  reminderId?: string;
  attachments?: Attachment[];
  onUploaded?: (attachment: Attachment) => void;
  onDeleted?: (id: string) => void;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function fileIcon(mimetype: string): string {
  if (mimetype.startsWith("image/")) return "🖼️";
  if (mimetype.startsWith("video/")) return "🎬";
  if (mimetype.startsWith("audio/")) return "🎵";
  if (mimetype.includes("pdf")) return "📄";
  if (mimetype.includes("zip") || mimetype.includes("rar") || mimetype.includes("7z")) return "📦";
  if (mimetype.includes("word") || mimetype.includes("document")) return "📝";
  if (mimetype.includes("excel") || mimetype.includes("spreadsheet")) return "📊";
  return "📎";
}

function isImageAttachment(attachment: Attachment): boolean {
  return attachment.mimetype.startsWith("image/");
}

export function FileUpload({ reminderId, attachments: initialAttachments = [], onUploaded, onDeleted }: FileUploadProps) {
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setMessage(null);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        if (reminderId) formData.append("reminderId", reminderId);

        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "上传失败");

        setAttachments((prev) => [data.item, ...prev]);
        onUploaded?.(data.item);
      }
      setMessage("上传成功");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除此附件？")) return;
    try {
      const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      onDeleted?.(id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    setMessage("已复制链接");
    setTimeout(() => setMessage(null), 1500);
  }

  return (
    <div className="space-y-3">
      {/* 上传区域 */}
      <div
        className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-4 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-500"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => { e.preventDefault(); handleUpload(e.dataTransfer.files); }}
      >
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
        {uploading ? (
          <span className="flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /> 上传中...</span>
        ) : (
          <span>📎 点击或拖拽上传附件（最大 100MB）</span>
        )}
      </div>

      {/* 附件列表 */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((att) => {
            const canPreview = isImageAttachment(att);

            return (
              <div key={att.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                {canPreview ? (
                  <button
                    type="button"
                    onClick={() => setPreviewAttachment(att)}
                    className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50 transition hover:ring-2 hover:ring-blue-300"
                    title="预览图片"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={att.url} alt={att.originalName} className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ) : (
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-slate-50 text-lg">
                    {fileIcon(att.mimetype)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{att.originalName}</p>
                  <p className="text-xs text-slate-500">{formatSize(att.size)}</p>
                </div>
                {canPreview ? (
                  <button onClick={() => setPreviewAttachment(att)} className="text-xs text-blue-600 hover:underline" title="预览图片">预览</button>
                ) : null}
                <button onClick={() => copyUrl(att.url)} className="text-xs text-blue-600 hover:underline" title="复制链接">复制链接</button>
                <a href={att.url} target="_blank" rel="noopener" className="text-xs text-slate-600 hover:underline">下载</a>
                <button onClick={() => handleDelete(att.id)} className="text-xs text-red-500 hover:underline">删除</button>
              </div>
            );
          })}
        </div>
      )}

      {previewAttachment ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="图片附件预览"
          onClick={() => setPreviewAttachment(null)}
        >
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{previewAttachment.originalName}</p>
                <p className="text-xs text-slate-500">{formatSize(previewAttachment.size)}</p>
              </div>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => setPreviewAttachment(null)}
              >
                关闭
              </button>
            </div>
            <div className="flex max-h-[75vh] items-center justify-center bg-slate-950 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewAttachment.url}
                alt={previewAttachment.originalName}
                className="max-h-[72vh] max-w-full rounded object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}

      {message && <p className="text-xs text-blue-600">{message}</p>}
    </div>
  );
}
