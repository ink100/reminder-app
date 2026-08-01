import type { NextRequest } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error";
import { requireApiSession } from "@/lib/auth";
import { supabaseModels } from "@/lib/reminders/store";

export async function POST(_request: NextRequest, context: RouteContext<"/api/reminders/[id]/restore">) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const reminder = await supabaseModels.reminder.findFirst({
      where: { id, deletedAt: null, completedAt: { not: null } },
    });

    if (!reminder) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const updatedReminder = await supabaseModels.reminder.update({
      where: { id },
      data: {
        completedAt: null,
        upcomingNotifiedAt: null,
        overdueNotifiedAt: null,
      },
    });

    return Response.json({ item: updatedReminder });
  } catch (error) {
    return toApiErrorResponse(error, { notFoundMessage: "Not found" });
  }
}
