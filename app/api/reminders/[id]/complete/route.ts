import type { NextRequest } from "next/server";
import { supabaseModels } from "@/lib/reminders/store";

import { requireApiSession } from "@/lib/auth";
import { toApiErrorResponse } from "@/lib/api-error";
import { buildReminderCompletionUpdate } from "@/lib/reminder-complete";

export async function POST(_request: NextRequest, context: RouteContext<"/api/reminders/[id]/complete">) {
  const session = await requireApiSession(_request);

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const reminder = await supabaseModels.reminder.findFirst({
      where: { id, deletedAt: null },
    });

    if (!reminder) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const linkedStoreAccount = await supabaseModels.licenseStoreAccount.findFirst({
      where: { reminderId: id, deletedAt: null },
      select: { id: true },
    });
    if (linkedStoreAccount && session.user.role !== "ADMIN") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (reminder.completedAt) {
      return Response.json({ item: reminder });
    }

    const completedAt = new Date();

    const completion = buildReminderCompletionUpdate({
      completedAt,
      recurrenceType: reminder.recurrenceType,
      recurrenceInterval: reminder.recurrenceInterval,
    });

    const updatedReminder = await supabaseModels.reminder.update({
      where: { id },
      data: completion.data,
    });

    return Response.json({
      item: updatedReminder,
      nextItem: completion.recurrenceAdvanced ? updatedReminder : null,
      recurrenceAdvanced: completion.recurrenceAdvanced,
    });
  } catch (error) {
    return toApiErrorResponse(error, { notFoundMessage: "Not found" });
  }
}
