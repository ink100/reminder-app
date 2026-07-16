"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  PAYMENT_QR_ATTACHMENT_TYPES,
  getPaymentQrLabel,
  type PaymentQrAttachmentType,
} from "@/lib/payment-qr";

type PaymentQrAttachment = {
  id: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  attachmentType: PaymentQrAttachmentType;
  createdAt: string;
};

type PaymentQrItems = {
  wechat: PaymentQrAttachment[];
  alipay: PaymentQrAttachment[];
};

function PaymentQrCard({
  attachmentType,
  items,
  onUploaded,
}: {
  attachmentType: PaymentQrAttachmentType;
  items: PaymentQrAttachment[];
  onUploaded: (item: PaymentQrAttachment) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const latest = items[0] ?? null;
  const label = getPaymentQrLabel(attachmentType) ?? "收款二维码";

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setMessage("上传中...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("attachmentType", attachmentType);
      const response = await fetch("/api/license/payment-qr", { method: "POST", body: formData });
      const data = (await response.json()) as { item?: PaymentQrAttachment; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "上传失败");
      onUploaded(data.item);
      setMessage("上传成功，记录已写入附件");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-balance font-semibold text-slate-900">{label}</h3>
            <p className="mt-1 text-xs text-slate-500">每次上传都会作为一条附件记录保留。</p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{items.length} 条记录</span>
        </div>
      </div>

      <div className="p-4">
        {latest ? (
          <a href={latest.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={latest.url} alt={label} className="aspect-square w-full object-contain" />
          </a>
        ) : (
          <div className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
            暂未上传
          </div>
        )}

        {latest ? (
          <div className="mt-3 min-w-0 text-xs text-slate-500">
            <p className="truncate" title={latest.originalName}>{latest.originalName}</p>
            <p>{new Date(latest.createdAt).toLocaleString("zh-CN", { hour12: false })}</p>
          </div>
        ) : null}

        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => void upload(event.target.files?.[0])}
        />
        <Button className="mt-4 min-h-11 w-full" type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? "上传中..." : latest ? "上传新的二维码" : "上传二维码"}
        </Button>
        <p className="mt-2 min-h-5 text-pretty text-xs text-slate-500">{message ?? "支持 PNG、JPG、WebP、GIF，最大 10MB。"}</p>
      </div>
    </article>
  );
}

export function PaymentQrManager() {
  const [items, setItems] = useState<PaymentQrItems>({ wechat: [], alipay: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/license/payment-qr", { cache: "no-store" });
      const data = (await response.json()) as { items?: PaymentQrItems; error?: string };
      if (!response.ok || !data.items) throw new Error(data.error ?? "加载二维码失败");
      setItems(data.items);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载二维码失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadItems);
  }, [loadItems]);

  function addUploaded(type: keyof PaymentQrItems, item: PaymentQrAttachment) {
    setItems((current) => ({ ...current, [type]: [item, ...current[type]] }));
  }

  return (
    <section className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">收款资料</p>
          <h2 className="text-balance text-xl font-semibold text-slate-950">微信与支付宝收款二维码</h2>
          <p className="mt-1 text-pretty text-sm text-slate-500">图片上传到 Cloudflare R2，元数据统一写入附件表，可在附件管理中查看历史记录。</p>
        </div>
        <Link className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" href="/images">
          查看附件记录
        </Link>
      </div>

      {message ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{message}</p> : null}
      {loading ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">加载收款二维码...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <PaymentQrCard attachmentType={PAYMENT_QR_ATTACHMENT_TYPES.wechat} items={items.wechat} onUploaded={(item) => addUploaded("wechat", item)} />
          <PaymentQrCard attachmentType={PAYMENT_QR_ATTACHMENT_TYPES.alipay} items={items.alipay} onUploaded={(item) => addUploaded("alipay", item)} />
        </div>
      )}
    </section>
  );
}
