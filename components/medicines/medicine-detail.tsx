"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { MEDICINE_ATTACHMENT_TYPES, getMedicineAttachmentLabel, getMedicineStatusLabel, type MedicineAttachmentType, type MedicineStatus } from "@/lib/medicines";

type MedicineItem = {
  id: string;
  name: string;
  category: string;
  tags: string | null;
  quantityTotal: number | null;
  quantityRemaining: number | null;
  unit: string;
  lowStockThreshold: number | null;
  locationText: string | null;
  contentText: string | null;
  openedAt: string | null;
  expiresAt: string | null;
  expirationReminderDays: number;
  notes: string | null;
  status: MedicineStatus;
};

type MedicineAttachment = {
  id: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  attachmentType: MedicineAttachmentType;
  sourceLabel: string;
  createdAt: string;
};

const attachmentSections: Array<{ type: MedicineAttachmentType; title: string; description: string }> = [
  { type: MEDICINE_ATTACHMENT_TYPES.photo, title: "药品照片", description: "药盒、药瓶或药袋外观。" },
  { type: MEDICINE_ATTACHMENT_TYPES.location, title: "位置照片", description: "药箱、抽屉、冰箱格子等存放位置。" },
  { type: MEDICINE_ATTACHMENT_TYPES.content, title: "药品内容照片", description: "说明书、用法用量、注意事项或医嘱截图。" },
];

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("zh-CN") : "未填写";
}

function formatSize(bytes: number) {
  if (!bytes) return "0 B";
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function AttachmentUploadCard({
  type,
  items,
  onUploaded,
}: {
  type: MedicineAttachmentType;
  items: MedicineAttachment[];
  onUploaded: (item: MedicineAttachment) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const section = attachmentSections.find((entry) => entry.type === type)!;

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setMessage("上传中...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("attachmentType", type);
      const response = await fetch(location.pathname.replace("/medicines/", "/api/medicines/") + "/attachments", { method: "POST", body: formData });
      const data = (await response.json()) as { item?: MedicineAttachment; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "上传失败");
      onUploaded(data.item);
      setMessage("上传成功");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="font-semibold text-slate-950">{section.title}</h3><p className="mt-1 text-xs text-slate-500">{section.description}</p></div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">{items.length} 张</span>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} />
      <button type="button" disabled={uploading} className="mt-3 min-h-11 w-full rounded-lg bg-slate-900 px-3 text-sm font-medium text-white disabled:opacity-50" onClick={() => inputRef.current?.click()}>{uploading ? "上传中..." : "上传照片"}</button>
      <p className="mt-2 min-h-5 text-xs text-slate-500">{message ?? "支持拍照或选择相册图片，最大 20MB。"}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt={item.originalName} className="aspect-square w-full object-cover" />
            <div className="p-2 text-xs text-slate-500"><p className="truncate" title={item.originalName}>{item.originalName}</p><p>{formatSize(item.size)}</p></div>
          </a>
        ))}
      </div>
    </section>
  );
}

export function MedicineDetail({ id }: { id: string }) {
  const [item, setItem] = useState<MedicineItem | null>(null);
  const [attachments, setAttachments] = useState<MedicineAttachment[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [medicineResponse, attachmentResponse] = await Promise.all([
        fetch(`/api/medicines/${id}`, { cache: "no-store" }),
        fetch(`/api/medicines/${id}/attachments`, { cache: "no-store" }),
      ]);
      const medicineData = (await medicineResponse.json()) as { item?: MedicineItem; error?: string };
      const attachmentData = (await attachmentResponse.json()) as { items?: MedicineAttachment[]; error?: string };
      if (!medicineResponse.ok || !medicineData.item) throw new Error(medicineData.error ?? "加载药品失败");
      if (!attachmentResponse.ok || !attachmentData.items) throw new Error(attachmentData.error ?? "加载附件失败");
      setItem(medicineData.item);
      setAttachments(attachmentData.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载失败");
    }
  }, [id]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  function addAttachment(attachment: MedicineAttachment) {
    setAttachments((current) => [attachment, ...current]);
  }

  if (message) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-600">{message}</div>;
  if (!item) return <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-slate-500">加载药品明细...</div>;

  return (
    <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><Link className="text-sm text-blue-600" href="/medicines">← 返回药品列表</Link><h1 className="mt-2 text-2xl font-bold text-slate-950">{item.name}</h1><p className="mt-1 text-sm text-slate-500">{item.category}{item.tags ? ` · ${item.tags}` : ""}</p></div>
        <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">{getMedicineStatusLabel(item.status)}</span>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="font-semibold text-slate-950">药品明细</h2>
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <p><span className="block text-xs text-slate-400">剩余量</span>{item.quantityRemaining ?? "-"}{item.unit} / {item.quantityTotal ?? "-"}{item.unit}</p>
          <p><span className="block text-xs text-slate-400">低库存阈值</span>{item.lowStockThreshold ?? "未设置"}{item.lowStockThreshold !== null ? item.unit : ""}</p>
          <p><span className="block text-xs text-slate-400">开封时间</span>{formatDate(item.openedAt)}</p>
          <p><span className="block text-xs text-slate-400">过期日期</span>{formatDate(item.expiresAt)}</p>
          <p><span className="block text-xs text-slate-400">过期提醒</span>提前 {item.expirationReminderDays} 天</p>
          <p className="sm:col-span-2"><span className="block text-xs text-slate-400">存放位置</span>{item.locationText || "未填写"}</p>
          <p><span className="block text-xs text-slate-400">备注</span>{item.notes || "无"}</p>
        </div>
        <div className="mt-4 rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-400">药品内容（文字）</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.contentText || "未填写，可在药品列表编辑或上传内容照片。"}</p></div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {attachmentSections.map((section) => (
          <AttachmentUploadCard key={section.type} type={section.type} items={attachments.filter((attachment) => attachment.attachmentType === section.type)} onUploaded={addAttachment} />
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-950">附件记录</h2>
        <div className="mt-3 space-y-2">
          {attachments.length === 0 ? <p className="text-sm text-slate-500">暂无附件</p> : attachments.map((attachment) => (
            <a key={attachment.id} href={attachment.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3 text-sm hover:bg-slate-50"><span className="min-w-0 truncate">{getMedicineAttachmentLabel(attachment.attachmentType)} · {attachment.originalName}</span><span className="shrink-0 text-xs text-slate-400">{new Date(attachment.createdAt).toLocaleDateString("zh-CN")}</span></a>
          ))}
        </div>
      </section>
    </div>
  );
}
