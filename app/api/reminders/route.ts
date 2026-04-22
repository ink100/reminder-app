import type { NextRequest } from "next/server";

import { requireApiSession } from "@/lib/auth";
import { toApiErrorResponse } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { reminderInputSchema } from "@/lib/validators/reminder";

export async function GET() {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reminders = await prisma.reminder.findMany({
    where: { deletedAt: null },
    orderBy: { dueAt: "asc" },
  });

  return Response.json({ items: reminders });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const input = reminderInputSchema.parse(await request.json());
    const reminder = await prisma.reminder.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        activationCode: input.activationCode ?? null,
        activationContact: input.activationCode ? input.activationContact ?? null : null,
        dueAt: new Date(input.dueAt),
        priority: input.priority,
        category: input.category ?? null,
        remindBeforeDays: input.remindBeforeDays,
        remindBeforeHours: input.remindBeforeHours,
        overdueRemindEnabled: input.overdueRemindEnabled,
        recurrenceType: input.recurrenceType ?? null,
        recurrenceInterval: input.recurrenceType ? input.recurrenceInterval ?? 1 : null,
        upcomingNotifiedAt: null,
        overdueNotifiedAt: null,
      },
    });

    return Response.json({ item: reminder }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { defaultMessage: "请求参数不合法" });
  }
}
