/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Prisma } from "@prisma/client";
import { supabaseModels } from "@/lib/reminders/store";
import type { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getPaymentQrSourceLabel } from "@/lib/payment-qr";
import { getMedicineAttachmentLabel } from "@/lib/medicines";

export async function GET(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");
  const search = searchParams.get("search") || "";
  const type = searchParams.get("type") || ""; // image / file / all

  const where: Prisma.AttachmentWhereInput = {
    deletedAt: null,
  };

  if (search) {
    where.originalName = { contains: search };
  }

  if (type === "image") {
    where.mimetype = { startsWith: "image/" };
  } else if (type === "file") {
    where.mimetype = { not: { startsWith: "image/" } };
  }

  const [total, items] = await Promise.all([
    supabaseModels.attachment.count({ where }),
    supabaseModels.attachment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        reminder: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    }),
  ]);

  const medicineIds = Array.from(new Set(items.map((item: any) => item.medicineId).filter((id: unknown): id is string => typeof id === "string")));
  const medicines = medicineIds.length
    ? await supabaseModels.medicine.findMany({ where: { deletedAt: null, OR: medicineIds.map((id) => ({ id })) } })
    : [];
  const medicineById = new Map(medicines.map((medicine) => [medicine.id, medicine.name]));
  const licenseStoreAccountIds = Array.from(new Set(items.map((item: any) => item.licenseStoreAccountId).filter((id: unknown): id is string => typeof id === "string")));
  const licenseStoreAccounts = licenseStoreAccountIds.length
    ? await supabaseModels.licenseStoreAccount.findMany({
        where: { OR: licenseStoreAccountIds.map((id) => ({ id })) },
        select: { id: true, shopName: true },
      })
    : [];
  const licenseStoreAccountById = new Map(licenseStoreAccounts.map((account) => [account.id, account.shopName]));

  // 转换为前端需要的格式
  const formattedItems = items.map((item: any) => {
    const medicineLabel = getMedicineAttachmentLabel(item.attachmentType);
    const medicineName = typeof item.medicineId === "string" ? medicineById.get(item.medicineId) : null;
    const licenseStoreAccountName = typeof item.licenseStoreAccountId === "string" ? licenseStoreAccountById.get(item.licenseStoreAccountId) : null;
    return {
      id: item.id,
      filename: item.filename,
      originalName: item.originalName,
      mimetype: item.mimetype,
      size: item.size,
      url: item.url,
      createdAt: item.createdAt.toISOString(),
      reminderId: item.reminderId,
      reminderTitle: item.reminder?.title || null,
      medicineId: item.medicineId,
      licenseStoreAccountId: item.licenseStoreAccountId,
      attachmentType: item.attachmentType,
      sourceLabel: getPaymentQrSourceLabel(item.attachmentType, licenseStoreAccountName) ?? (medicineLabel ? `${medicineLabel}${medicineName ? ` · ${medicineName}` : ""}` : null) ?? item.reminder?.title ?? "通用附件",
    };
  });

  return Response.json({
    items: formattedItems,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}
