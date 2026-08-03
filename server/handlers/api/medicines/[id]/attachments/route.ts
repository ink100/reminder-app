import * as path from "node:path";


import { requireApiSession } from "@/lib/auth";
import { toApiErrorResponse } from "@/lib/api-error";
import { normalizeMedicineImage } from "@/lib/medicine-image";
import { getMedicineAttachmentLabel, isMedicineAttachmentType, validateMedicineAttachmentUpload } from "@/lib/medicines";
import { attachmentStore, medicineStore } from "@/lib/reminders/store";
import { deleteFromR2, uploadToR2 } from "@/lib/r2-storage";

const MAX_MEDICINE_MULTIPART_BYTES = 21 * 1024 * 1024;

function serializeAttachment(item: Awaited<ReturnType<typeof attachmentStore.findMany>>[number]) {
  return {
    id: item.id,
    originalName: item.originalName,
    mimetype: item.mimetype,
    size: item.size,
    url: item.url,
    attachmentType: item.attachmentType,
    sourceLabel: getMedicineAttachmentLabel(item.attachmentType) ?? "药品附件",
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(_request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const medicine = await medicineStore.findUnique({ where: { id } });
  if (!medicine || medicine.deletedAt) return Response.json({ error: "药品不存在" }, { status: 404 });
  const items = await attachmentStore.findMany({ where: { deletedAt: null, medicineId: id }, orderBy: { createdAt: "desc" } });
  return Response.json({ items: items.map(serializeAttachment) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_MEDICINE_MULTIPART_BYTES) {
      return Response.json({ error: "药品图片不能超过 20MB" }, { status: 413 });
    }

    const { id } = await params;
    const medicine = await medicineStore.findUnique({ where: { id } });
    if (!medicine || medicine.deletedAt) return Response.json({ error: "药品不存在" }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get("file");
    const attachmentType = formData.get("attachmentType");
    if (!(file instanceof File)) return Response.json({ error: "请选择图片" }, { status: 400 });
    const normalizedType = typeof attachmentType === "string" ? attachmentType : null;
    const validationError = validateMedicineAttachmentUpload({ attachmentType: normalizedType, mimetype: file.type, size: file.size });
    if (validationError) return Response.json({ error: validationError }, { status: 400 });
    if (!isMedicineAttachmentType(normalizedType)) return Response.json({ error: "不支持的药品附件类型" }, { status: 400 });

    const sourceBuffer = Buffer.from(await file.arrayBuffer());
    const normalized = await normalizeMedicineImage(sourceBuffer);
    if (normalized.buffer.length > 20 * 1024 * 1024) {
      return Response.json({ error: "药品图片不能超过 20MB" }, { status: 413 });
    }
    const normalizedName = `${path.parse(file.name).name || "medicine"}.${normalized.extension}`;
    const { key, url } = await uploadToR2(normalized.buffer, normalizedName, normalized.mimetype);
    try {
      const item = await attachmentStore.create({
        data: {
          filename: key.split("/").pop() || normalizedName,
          originalName: file.name,
          mimetype: normalized.mimetype,
          size: normalized.buffer.length,
          r2Key: key,
          url,
          reminderId: null,
          medicineId: id,
          attachmentType: normalizedType,
        },
      });
      return Response.json({ item: serializeAttachment(item) }, { status: 201 });
    } catch (error) {
      await deleteFromR2(key).catch((cleanupError) => {
        console.error("药品附件写入失败后清理 R2 文件失败", { key, cleanupError });
      });
      throw error;
    }
  } catch (error) {
    return toApiErrorResponse(error, { defaultMessage: "药品附件上传失败" });
  }
}
