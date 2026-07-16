import path from "node:path";

import type { NextRequest } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error";
import { requireApiSession } from "@/lib/auth";
import {
  PAYMENT_QR_ATTACHMENT_TYPES,
  isPaymentQrAttachmentType,
  validatePaymentQrUpload,
} from "@/lib/payment-qr";
import { normalizePaymentQrImage } from "@/lib/payment-qr-image";
import { attachmentStore } from "@/lib/reminders/store";
import { deleteFromR2, uploadToR2 } from "@/lib/r2-storage";

const MAX_PAYMENT_QR_MULTIPART_BYTES = 11 * 1024 * 1024;

type PaymentQrResponseItem = {
  id: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  attachmentType: string | null;
  createdAt: string;
};

function toPaymentQrResponseItem(item: {
  id: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  attachmentType: string | null;
  createdAt: Date | string;
}): PaymentQrResponseItem {
  return {
    id: item.id,
    originalName: item.originalName,
    mimetype: item.mimetype,
    size: item.size,
    url: item.url,
    attachmentType: item.attachmentType,
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
  };
}

export async function GET() {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [wechat, alipay] = await Promise.all([
    attachmentStore.findMany({
      where: { deletedAt: null, attachmentType: PAYMENT_QR_ATTACHMENT_TYPES.wechat },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    attachmentStore.findMany({
      where: { deletedAt: null, attachmentType: PAYMENT_QR_ATTACHMENT_TYPES.alipay },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return Response.json({ items: { wechat: wechat.map(toPaymentQrResponseItem), alipay: alipay.map(toPaymentQrResponseItem) } });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_PAYMENT_QR_MULTIPART_BYTES) {
      return Response.json({ error: "二维码图片不能超过 10MB" }, { status: 413 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const attachmentType = formData.get("attachmentType");

    if (!(file instanceof File)) return Response.json({ error: "请选择二维码图片" }, { status: 400 });
    const normalizedType = typeof attachmentType === "string" ? attachmentType : null;
    const validationError = validatePaymentQrUpload({
      attachmentType: normalizedType,
      mimetype: file.type,
      size: file.size,
    });
    if (validationError) return Response.json({ error: validationError }, { status: 400 });
    if (!isPaymentQrAttachmentType(normalizedType)) return Response.json({ error: "不支持的收款码类型" }, { status: 400 });

    const sourceBuffer = Buffer.from(await file.arrayBuffer());
    const normalized = await normalizePaymentQrImage(sourceBuffer);
    const normalizedName = `${path.parse(file.name).name || "payment-qr"}.${normalized.extension}`;
    const { key, url } = await uploadToR2(normalized.buffer, normalizedName, normalized.mimetype);
    let item;
    try {
      item = await attachmentStore.create({
        data: {
          filename: key.split("/").pop() || path.basename(file.name),
          originalName: file.name,
          mimetype: normalized.mimetype,
          size: normalized.buffer.length,
          r2Key: key,
          url,
          reminderId: null,
          attachmentType: normalizedType,
        },
      });
    } catch (error) {
      await deleteFromR2(key).catch((cleanupError) => {
        console.error("收款码附件写入失败后清理 R2 文件失败", { key, cleanupError });
      });
      throw error;
    }

    return Response.json({ item }, { status: 201 });
  } catch (error) {
    console.error("收款二维码上传失败", error);
    return toApiErrorResponse(error, { defaultMessage: "收款二维码上传失败" });
  }
}
