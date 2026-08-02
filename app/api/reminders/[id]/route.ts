import type { NextRequest } from "next/server";
import { supabaseModels } from "@/lib/reminders/store";

import { requireApiSession } from "@/lib/auth";
import { toApiErrorResponse } from "@/lib/api-error";
import { ReminderAttachmentDeleteError, softDeleteReminderWithAttachments } from "@/lib/reminder-delete";
import { buildLicenseStoreReminderSchedule } from "@/lib/license-store-reminder";
import { reminderInputSchema } from "@/lib/validators/reminder";

export async function GET(_request: NextRequest, context: RouteContext<"/api/reminders/[id]">) {
  const session = await requireApiSession(_request);

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const reminder = await supabaseModels.reminder.findUnique({ where: { id } });

  if (!reminder || reminder.deletedAt) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ item: reminder });
}

export async function PUT(request: NextRequest, context: RouteContext<"/api/reminders/[id]">) {
  const session = await requireApiSession(request);

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const exists = await supabaseModels.reminder.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!exists) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const linkedStoreAccount = await supabaseModels.licenseStoreAccount.findFirst({
      where: { reminderId: id, deletedAt: null },
      select: { id: true },
    });
    if (linkedStoreAccount && session.user.role !== "ADMIN") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const input = reminderInputSchema.parse(await request.json());
    const dueAt = new Date(input.dueAt);
    const ownedSchedule = linkedStoreAccount
      ? buildLicenseStoreReminderSchedule(dueAt)
      : null;
    const reminder = await supabaseModels.reminder.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description ?? null,
        activationCode: input.activationCode ?? null,
        activationContact: input.activationCode ? input.activationContact ?? null : null,
        dueAt,
        priority: input.priority,
        category: input.category ?? null,
        remindBeforeDays: input.remindBeforeDays,
        remindBeforeHours: input.remindBeforeHours,
        overdueRemindEnabled: input.overdueRemindEnabled,
        recurrenceType: ownedSchedule
          ? ownedSchedule.recurrenceType
          : input.recurrenceType ?? null,
        recurrenceInterval: ownedSchedule
          ? ownedSchedule.recurrenceInterval
          : input.recurrenceType
            ? input.recurrenceInterval ?? 1
            : null,
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
  const session = await requireApiSession(_request);

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const reminder = await supabaseModels.reminder.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!reminder) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const linkedStoreAccount = await supabaseModels.licenseStoreAccount.findFirst({
      where: { reminderId: id, deletedAt: null },
      select: { id: true },
    });
    if (linkedStoreAccount) {
      return Response.json(
        { error: "该提醒由店铺账号自动维护，请从激活码关联店铺表格删除对应店铺" },
        { status: 409 },
      );
    }

    const result = await softDeleteReminderWithAttachments(id);

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
