"use client";

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
  licenseStoreAccountId: string;
  createdAt: string;
};

type PaymentQrItems = {
  wechat: PaymentQrAttachment | null;
  alipay: PaymentQrAttachment | null;
};

function PaymentQrCard({
  accountId,
  attachmentType,
  item,
  onChanged,
}: {
  accountId: string;
  attachmentType: PaymentQrAttachmentType;
  item: PaymentQrAttachment | null;
  onChanged: (item: PaymentQrAttachment | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const label = getPaymentQrLabel(attachmentType) ?? "收款二维码";
  const endpoint = `/api/license/store-accounts/${encodeURIComponent(accountId)}/payment-qr`;

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage("上传中...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("attachmentType", attachmentType);
      const response = await fetch(endpoint, { method: "POST", body: formData });
      const data = (await response.json()) as { item?: PaymentQrAttachment; error?: string; cleanupPending?: boolean };
      if (!response.ok || !data.item) throw new Error(data.error ?? "上传失败");
      onChanged(data.item);
      setMessage(data.cleanupPending ? "二维码已保存，旧对象存储文件暂待维护清理" : item ? "二维码已替换" : "二维码已上传");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!item || !window.confirm(`确定删除这张${label}吗？`)) return;
    setBusy(true);
    setMessage("删除中...");
    try {
      const response = await fetch(`${endpoint}?attachmentType=${encodeURIComponent(attachmentType)}`, { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as { error?: string; cleanupPending?: boolean } | null;
      if (!response.ok) throw new Error(data?.error ?? "删除失败");
      onChanged(null);
      setMessage(data?.cleanupPending ? "二维码记录已删除，对象存储文件暂待维护清理" : "二维码已删除");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-2">
        <h4 className="font-medium text-slate-900">{label}</h4>
      </div>
      <div className="p-3">
        {item ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt={label} className="aspect-square w-full object-contain" />
          </a>
        ) : (
          <div className="flex aspect-square items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">暂未上传</div>
        )}
        {item ? (
          <div className="mt-2 min-w-0 text-xs text-slate-500">
            <p className="truncate" title={item.originalName}>{item.originalName}</p>
            <p>{new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}</p>
          </div>
        ) : null}
        <input ref={inputRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void upload(event.target.files?.[0])} />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button className="min-h-11" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? "处理中..." : item ? "替换截图" : "上传截图"}
          </Button>
          {item ? <Button className="min-h-11 bg-red-600 hover:bg-red-700" type="button" disabled={busy} onClick={() => void remove()}>删除截图</Button> : null}
        </div>
        <p className="mt-2 min-h-5 text-pretty text-xs text-slate-500">{message ?? "支持 PNG、JPG、WebP、GIF，最大 10MB。"}</p>
      </div>
    </article>
  );
}

export function PaymentQrManager({ accountId, shopName }: { accountId: string; shopName: string }) {
  const [items, setItems] = useState<PaymentQrItems>({ wechat: null, alipay: null });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const endpoint = `/api/license/store-accounts/${encodeURIComponent(accountId)}/payment-qr`;

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = (await response.json()) as { items?: PaymentQrItems; error?: string };
      if (!response.ok || !data.items) throw new Error(data.error ?? "加载二维码失败");
      setItems(data.items);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载二维码失败");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void Promise.resolve().then(loadItems);
  }, [loadItems]);

  return (
    <section className="min-w-0 rounded-lg border border-sky-100 bg-sky-50/40 p-3 sm:p-4">
      <div className="mb-3">
        <p className="text-xs text-slate-500">记录专属收款码</p>
        <h3 className="break-words font-semibold text-slate-900">{shopName} · 微信/支付宝二维码截图</h3>
        <p className="mt-1 text-xs text-slate-500">二维码仅关联当前店铺记录，不会作为所有店铺共用的总二维码。</p>
      </div>
      {message ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{message}</p> : null}
      {loading ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">加载收款二维码...</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <PaymentQrCard accountId={accountId} attachmentType={PAYMENT_QR_ATTACHMENT_TYPES.wechat} item={items.wechat} onChanged={(item) => setItems((current) => ({ ...current, wechat: item }))} />
          <PaymentQrCard accountId={accountId} attachmentType={PAYMENT_QR_ATTACHMENT_TYPES.alipay} item={items.alipay} onChanged={(item) => setItems((current) => ({ ...current, alipay: item }))} />
        </div>
      )}
    </section>
  );
}
