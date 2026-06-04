import type { NextRequest } from "next/server";

import { requireApiSession } from "@/lib/auth";
import { toApiErrorResponse } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { ReminderAttachmentDeleteError, softDeleteReminderWithAttachments } from "@/lib/reminder-delete";
import { reminderInputSchema } from "@/lib/validators/reminder";

export async function GET(_request: NextRequest, context: RouteContext<"/api/reminders/[id]">) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const reminder = await prisma.reminder.findUnique({ where: { id } });

  if (!reminder || reminder.deletedAt) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ item: reminder });
}

export async function PUT(request: NextRequest, context: RouteContext<"/api/reminders/[id]">) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const exists = await prisma.reminder.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!exists) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const input = reminderInputSchema.parse(await request.json());
    const reminder = await prisma.reminder.update({
      where: { id },
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

    return Response.json({ item: reminder });
  } catch (error) {
    return toApiErrorResponse(error, {
      defaultMessage: "请求参数不合法",
      notFoundMessage: "Not found",
    });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext<"/api/reminders/[id]">) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const reminder = await prisma.reminder.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!reminder) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const result = await softDeleteReminderWithAttachments(prisma, id);

    return Response.json({ success: true, deletedAttachments: result.attachmentCount });
  } catch (error) {
    if (error instanceof ReminderAttachmentDeleteError) {
      return Response.json(
        { error: "删除提醒附件文件失败，请稍后重试", failedKeys: error.failedKeys },
        { status: 500 }
      );
    }

    return toApiErrorResponse(error, { notFoundMessage: "Not found" });
  }
}
