import type { NextRequest } from "next/server";
import { supabaseModels } from "@/lib/reminders/store";

import { requireApiSession } from "@/lib/auth";
import { toApiErrorResponse } from "@/lib/api-error";
import { licenseStoreAccountInputSchema } from "@/lib/validators/license-store-account";

const reminderSelect = {
  id: true,
  title: true,
  dueAt: true,
  activationCode: true,
  deletedAt: true,
} as const;

export async function PUT(request: NextRequest, context: RouteContext<"/api/license/store-accounts/[id]">) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const exists = await supabaseModels.licenseStoreAccount.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!exists) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const input = licenseStoreAccountInputSchema.parse(await request.json());
    const reminderId = input.reminderId || null;

    if (reminderId) {
      const reminder = await supabaseModels.reminder.findFirst({
        where: { id: reminderId, deletedAt: null },
        select: { id: true },
      });

      if (!reminder) {
        return Response.json({ error: "关联提醒不存在或已删除" }, { status: 404 });
      }
    }

    const item = await supabaseModels.licenseStoreAccount.update({
      where: { id },
      data: {
        shopName: input.shopName,
        phone: input.phone,
        remoteCode: input.remoteCode,
        remotePassword: input.remotePassword,
        isOtherAccount: input.isOtherAccount,
        expiresAt: input.expiresAt,
        activationCode: input.activationCode,
        reminderId,
      },
      include: { reminder: { select: reminderSelect } },
    });

    return Response.json({ item });
  } catch (error) {
    return toApiErrorResponse(error, {
      defaultMessage: "请求参数不合法",
      notFoundMessage: "Not found",
    });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext<"/api/license/store-accounts/[id]">) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const exists = await supabaseModels.licenseStoreAccount.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!exists) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    await supabaseModels.licenseStoreAccount.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return Response.json({ success: true });
  } catch (error) {
    return toApiErrorResponse(error, { notFoundMessage: "Not found" });
  }
}
