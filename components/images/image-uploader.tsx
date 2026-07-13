"use client";

import { useState, useRef, useCallback } from "react";

interface FileData {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  createdAt: string;
}

interface FileUploaderProps {
  onUploadSuccess: (file: FileData) => void;
}

export function FileUploader({ onUploadSuccess }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [uploadedFiles, setUploadedFiles] = useState<FileData[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const copyUrl = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleUpload = useCallback(
    async (files: FileList | File[]) => {
      setIsUploading(true);
      setUploadedFiles([]);

      const fileArray = Array.from(files);
      const results: FileData[] = [];

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        setUploadProgress(`上传中 (${i + 1}/${fileArray.length}): ${file.name}`);

        const formData = new FormData();
        formData.append("file", file);

        try {
          const res = await fetch("/api/images", {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            const { data } = await res.json();
            results.push(data);
            onUploadSuccess(data);
          } else {
            const error = await res.json();
            alert(error.error || "上传失败");
          }
        } catch (err) {
          console.error("上传失败:", err);
          alert("上传失败");
        }
      }

      setUploadedFiles(results);
      setIsUploading(false);
      setUploadProgress("");
    },
    [onUploadSuccess]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleUpload(files);
      }
    },
    [handleUpload]
  );

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleUpload(files);
      e.target.value = "";
    }
  };

  const copyAllUrls = () => {
    const urls = uploadedFiles.map((f) => f.url).join("\n");
    navigator.clipboard.writeText(urls);
    setCopiedId("all");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* 上传区域 */}
      <div
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center transition-all sm:p-8 ${
          isDragging
            ? "border-blue-500 bg-blue-50"
            : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            <p className="text-sm text-slate-600">{uploadProgress || "上传中..."}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <svg
              className="h-12 w-12 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <div>
              <p className="text-base font-medium text-slate-700">
                拖拽文件到这里
              </p>
              <p className="mt-1 text-sm text-slate-500">
                或者 <span className="text-blue-500 underline">点击选择文件</span>
              </p>
            </div>
            <p className="text-xs text-slate-400">
              支持任意格式文件，最大 100MB，可多选
            </p>
          </div>
        )}
      </div>

      {/* 上传成功后的 URL 回显 */}
      {uploadedFiles.length > 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold text-green-800">
              ✅ 上传成功 ({uploadedFiles.length} 个文件)
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                onClick={copyAllUrls}
                className="min-h-11 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 sm:min-h-0"
              >
                {copiedId === "all" ? "✓ 已复制" : "复制全部链接"}
              </button>
              <button
                onClick={() => setUploadedFiles([])}
                className="min-h-11 rounded-lg border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 sm:min-h-0"
              >
                关闭
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className="flex min-w-0 flex-col gap-3 rounded-lg border border-green-100 bg-white p-3 sm:flex-row sm:items-center"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {file.originalName}
                  </p>
                  <p className="text-xs text-blue-600 truncate font-mono mt-1">
                    {file.url}
                  </p>
                </div>
                <div className="grid w-full shrink-0 grid-cols-3 gap-1 sm:w-auto sm:flex">
                  <button
                    onClick={() => copyUrl(file.url, file.id)}
                    className="min-h-11 rounded-md bg-green-100 px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-200 sm:min-h-0"
                  >
                    {copiedId === file.id ? "✓" : "URL"}
                  </button>
                  <button
                    onClick={() => copyUrl(`![image](${file.url})`, `md-${file.id}`)}
                    className="min-h-11 rounded-md bg-green-100 px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-200 sm:min-h-0"
                  >
                    {copiedId === `md-${file.id}` ? "✓" : "MD"}
                  </button>
                  <button
                    onClick={() => copyUrl(`<img src="${file.url}" />`, `html-${file.id}`)}
                    className="min-h-11 rounded-md bg-green-100 px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-200 sm:min-h-0"
                  >
                    {copiedId === `html-${file.id}` ? "✓" : "HTML"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
