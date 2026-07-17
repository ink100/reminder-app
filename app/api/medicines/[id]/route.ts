import type { NextRequest } from "next/server";

import { requireApiSession } from "@/lib/auth";
import { toApiErrorResponse } from "@/lib/api-error";
import { getMedicineStatus, parseMedicineInput } from "@/lib/medicines";
import { syncMedicineExpirationReminder } from "@/lib/medicine-expiration-reminder";
import { medicineStore } from "@/lib/reminders/store";

function serializeMedicine(item: Awaited<ReturnType<typeof medicineStore.findUnique>>) {
  if (!item) return null;
  return { ...item, status: getMedicineStatus(item) };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const item = await medicineStore.findUnique({ where: { id } });
  if (!item || item.deletedAt) return Response.json({ error: "药品不存在" }, { status: 404 });
  return Response.json({ item: serializeMedicine(item) });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const existing = await medicineStore.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) return Response.json({ error: "药品不存在" }, { status: 404 });
    const input = parseMedicineInput(await request.json());
    const item = await medicineStore.update({
      where: { id },
      data: {
        name: input.name,
        category: input.category,
        tags: input.tags ?? null,
        quantityTotal: input.quantityTotal ?? null,
        quantityRemaining: input.quantityRemaining ?? input.quantityTotal ?? null,
        unit: input.unit,
        lowStockThreshold: input.lowStockThreshold ?? null,
        locationText: input.locationText ?? null,
        contentText: input.contentText ?? null,
        openedAt: input.openedAt ? new Date(input.openedAt) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        expirationReminderDays: input.expirationReminderDays ?? 30,
        notes: input.notes ?? null,
      },
    });
    await syncMedicineExpirationReminder(item);
    const refreshed = await medicineStore.findUnique({ where: { id } });
    return Response.json({ item: serializeMedicine(refreshed ?? item) });
  } catch (error) {
    return toApiErrorResponse(error, { defaultMessage: "药品保存失败" });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const item = await medicineStore.findUnique({ where: { id } });
    if (!item || item.deletedAt) return Response.json({ error: "药品不存在" }, { status: 404 });
    const deletedAt = new Date();
    await medicineStore.update({ where: { id }, data: { deletedAt } });
    if (item.expirationReminderId) await syncMedicineExpirationReminder({ ...item, deletedAt });
    return Response.json({ success: true });
  } catch (error) {
    return toApiErrorResponse(error, { defaultMessage: "药品删除失败" });
  }
}
