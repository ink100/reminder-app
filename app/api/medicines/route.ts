import type { NextRequest } from "next/server";

import { requireApiSession } from "@/lib/auth";
import { toApiErrorResponse } from "@/lib/api-error";
import { getMedicineStatus, parseMedicineInput } from "@/lib/medicines";
import { syncMedicineExpirationReminder } from "@/lib/medicine-expiration-reminder";
import { medicineStore } from "@/lib/reminders/store";

function serializeMedicine(item: Awaited<ReturnType<typeof medicineStore.findMany>>[number]) {
  return { ...item, status: getMedicineStatus(item) };
}

export async function GET() {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const items = await medicineStore.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" } });
  return Response.json({ items: items.map(serializeMedicine) });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const input = parseMedicineInput(await request.json());
    const item = await medicineStore.create({
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
        expirationReminderId: null,
        notes: input.notes ?? null,
        deletedAt: null,
      },
    });
    await syncMedicineExpirationReminder(item);
    const refreshed = await medicineStore.findUnique({ where: { id: item.id } });
    return Response.json({ item: refreshed ? serializeMedicine(refreshed) : serializeMedicine(item) }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { defaultMessage: "药品保存失败" });
  }
}
