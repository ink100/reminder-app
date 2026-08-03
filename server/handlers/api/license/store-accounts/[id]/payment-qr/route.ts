import path from "node:path";

import { toApiErrorResponse } from "@/lib/api-error";
import { requireAdminApi } from "@/lib/admin-api";
import { callRpc } from "@/lib/notification-center/store";
import {
  PAYMENT_QR_ATTACHMENT_TYPES,
  getPaymentQrSlots,
  isPaymentQrAttachmentType,
  validatePaymentQrUpload,
} from "@/lib/payment-qr";
import { normalizePaymentQrImage } from "@/lib/payment-qr-image";
import { attachmentStore, createCuid, licenseStoreAccountStore } from "@/lib/reminders/store";
import { cleanupR2Keys } from "@/lib/r2-cleanup";
import { uploadToR2 } from "@/lib/r2-storage";

const MAX_PAYMENT_QR_MULTIPART_BYTES = 11 * 1024 * 1024;

type PaymentQrResponseItem = {
  id: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  attachmentType: string | null;
  licenseStoreAccountId: string | null;
  createdAt: string;
};

type PaymentQrReplaceResult = {
  oldR2Key: string | null;
  item: PaymentQrResponseItem;
};

function toPaymentQrResponseItem(item: {
  id: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  attachmentType: string | null;
  licenseStoreAccountId: string | null;
  createdAt: Date | string;
}): PaymentQrResponseItem {
  return {
    id: item.id,
    originalName: item.originalName,
    mimetype: item.mimetype,
    size: item.size,
    url: item.url,
    attachmentType: item.attachmentType,
    licenseStoreAccountId: item.licenseStoreAccountId,
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
  };
}

async function findActiveAccount(id: string) {
  return licenseStoreAccountStore.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  const { id } = await context.params;
  if (!(await findActiveAccount(id))) return Response.json({ error: "店铺记录不存在或已删除" }, { status: 404 });

  const items = await attachmentStore.findMany({
    where: {
      licenseStoreAccountId: id,
      deletedAt: null,
      OR: [
        { attachmentType: PAYMENT_QR_ATTACHMENT_TYPES.wechat },
        { attachmentType: PAYMENT_QR_ATTACHMENT_TYPES.alipay },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  const slots = getPaymentQrSlots(items);

  return Response.json({
    items: {
      wechat: slots.wechat ? toPaymentQrResponseItem(slots.wechat) : null,
      alipay: slots.alipay ? toPaymentQrResponseItem(slots.alipay) : null,
    },
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    if (!(await findActiveAccount(id))) return Response.json({ error: "店铺记录不存在或已删除" }, { status: 404 });

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_PAYMENT_QR_MULTIPART_BYTES) {
      return Response.json({ error: "二维码图片不能超过 10MB" }, { status: 413 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const attachmentType = formData.get("attachmentType");
    if (!(file instanceof File)) return Response.json({ error: "请选择二维码图片" }, { status: 400 });

    const normalizedType = typeof attachmentType === "string" ? attachmentType : null;
    const validationError = validatePaymentQrUpload({ attachmentType: normalizedType, mimetype: file.type, size: file.size });
    if (validationError) return Response.json({ error: validationError }, { status: 400 });
    if (!isPaymentQrAttachmentType(normalizedType)) return Response.json({ error: "不支持的收款码类型" }, { status: 400 });

    const sourceBuffer = Buffer.from(await file.arrayBuffer());
    const normalized = await normalizePaymentQrImage(sourceBuffer);
    const normalizedName = `${path.parse(file.name).name || "payment-qr"}.${normalized.extension}`;
    const { key, url } = await uploadToR2(normalized.buffer, normalizedName, normalized.mimetype);
    const newId = createCuid();
    const createdAt = new Date();
    let replacement: PaymentQrReplaceResult;

    try {
      replacement = await callRpc<PaymentQrReplaceResult>("replace_license_store_account_payment_qr", {
        p_account_id: id,
        p_attachment_type: normalizedType,
        p_new_id: newId,
        p_filename: key.split("/").pop() || path.basename(normalizedName),
        p_original_name: file.name,
        p_mimetype: normalized.mimetype,
        p_size: normalized.buffer.length,
        p_r2_key: key,
        p_url: url,
        p_created_at: createdAt.toISOString(),
      });
    } catch (error) {
      const failedCleanupKeys = await cleanupR2Keys([key]);
      if (failedCleanupKeys.length > 0) {
        await attachmentStore.create({
          data: {
            id: newId,
            filename: key.split("/").pop() || path.basename(normalizedName),
            originalName: file.name,
            mimetype: normalized.mimetype,
            size: normalized.buffer.length,
            r2Key: key,
            url,
            reminderId: null,
            medicineId: null,
            licenseStoreAccountId: null,
            attachmentType: "r2_cleanup_pending",
            createdAt,
            deletedAt: createdAt,
          },
        }).catch((metadataError) => {
          console.error("收款二维码补偿清理失败且待清理元数据写入失败", { key, metadataError });
        });
      }
      throw error;
    }

    const failedCleanupKeys = replacement.oldR2Key && replacement.oldR2Key !== key
      ? await cleanupR2Keys([replacement.oldR2Key])
      : [];
    return Response.json(
      { item: replacement.item, cleanupPending: failedCleanupKeys.length > 0 },
      { status: replacement.oldR2Key ? 200 : 201 },
    );
  } catch (error) {
    console.error("店铺收款二维码上传失败", error);
    return toApiErrorResponse(error, { defaultMessage: "收款二维码上传失败" });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    if (!(await findActiveAccount(id))) return Response.json({ error: "店铺记录不存在或已删除" }, { status: 404 });

    const attachmentType = new URL(request.url).searchParams.get("attachmentType");
    if (!isPaymentQrAttachmentType(attachmentType)) return Response.json({ error: "不支持的收款码类型" }, { status: 400 });

    const deletedAt = new Date();
    const oldR2Key = await callRpc<string | null>("clear_license_store_account_payment_qr", {
      p_account_id: id,
      p_attachment_type: attachmentType,
      p_deleted_at: deletedAt.toISOString(),
    });
    const failedCleanupKeys = await cleanupR2Keys([oldR2Key]);
    return Response.json({ success: true, cleanupPending: failedCleanupKeys.length > 0 });
  } catch (error) {
    return toApiErrorResponse(error, { defaultMessage: "删除收款二维码失败" });
  }
}
