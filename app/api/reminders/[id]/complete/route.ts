import type { NextRequest } from "next/server";

import { requireApiSession } from "@/lib/auth";
import { toApiErrorResponse } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { computeNextRecurringDueAt } from "@/lib/reminder-recurrence";

export async function POST(_request: NextRequest, context: RouteContext<"/api/reminders/[id]/complete">) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const reminder = await prisma.reminder.findFirst({
      where: { id, deletedAt: null },
    });

    if (!reminder) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    if (reminder.completedAt) {
      return Response.json({ item: reminder });
    }

    const completedAt = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const completedReminder = await tx.reminder.update({
        where: { id },
        data: { completedAt },
      });

      let nextReminder = null;

      if (reminder.recurrenceType && reminder.recurrenceInterval) {
        nextReminder = await tx.reminder.create({
          data: {
            title: reminder.title,
            description: reminder.description,
            activationCode: reminder.activationCode,
            activationContact: reminder.activationContact,
            dueAt: computeNextRecurringDueAt({
              completedAt,
              recurrenceType: reminder.recurrenceType as "daily" | "weekly" | "monthly",
              recurrenceInterval: reminder.recurrenceInterval,
            }),
            priority: reminder.priority,
            category: reminder.category,
            remindBeforeDays: reminder.remindBeforeDays,
            remindBeforeHours: reminder.remindBeforeHours,
            overdueRemindEnabled: reminder.overdueRemindEnabled,
            recurrenceType: reminder.recurrenceType,
            recurrenceInterval: reminder.recurrenceInterval,
            upcomingNotifiedAt: null,
            overdueNotifiedAt: null,
          },
        });
      }

      return { item: completedReminder, nextItem: nextReminder };
    });

    return Response.json(result);
  } catch (error) {
    return toApiErrorResponse(error, { notFoundMessage: "Not found" });
  }
}
