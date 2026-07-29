import type { NextRequest } from "next/server";
import { callRpc } from "@/lib/notification-center/store";
import { cleanupR2Keys } from "@/lib/r2-cleanup";
import { supabaseModels } from "@/lib/reminders/store";

import { requireAdminApi } from "@/lib/admin-api";
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
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

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
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    const exists = await supabaseModels.licenseStoreAccount.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!exists) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const deletedAt = new Date();
    const objectKeys = await callRpc<string[]>("soft_delete_license_store_account_with_attachments", {
      p_account_id: id,
      p_deleted_at: deletedAt.toISOString(),
    });
    const failedCleanupKeys = await cleanupR2Keys(objectKeys);

    return Response.json({
      success: true,
      deletedAttachments: objectKeys.length,
      cleanupPending: failedCleanupKeys.length > 0,
    });
  } catch (error) {
    return toApiErrorResponse(error, { notFoundMessage: "Not found" });
  }
}
