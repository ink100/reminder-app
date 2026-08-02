import type { NextRequest } from "next/server";
import { callRpc } from "@/lib/notification-center/store";
import { cleanupR2Keys } from "@/lib/r2-cleanup";
import { supabaseModels } from "@/lib/reminders/store";

import { requireAdminApi } from "@/lib/admin-api";
import { toApiErrorResponse } from "@/lib/api-error";
import { licenseStoreAccountInputSchema } from "@/lib/validators/license-store-account";

export async function PUT(request: NextRequest, context: RouteContext<"/api/license/store-accounts/[id]">) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    const exists = await supabaseModels.licenseStoreAccount.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, reminderId: true },
    });

    if (!exists) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const input = licenseStoreAccountInputSchema.parse(await request.json());
    const item = await callRpc<Record<string, unknown>>("update_license_store_account_with_reminder", {
      p_account_id: id,
      p_shop_name: input.shopName,
      p_phone: input.phone,
      p_remote_code: input.remoteCode,
      p_remote_password: input.remotePassword,
      p_is_other_account: input.isOtherAccount,
      p_expires_at: input.expiresAt.toISOString(),
      p_activation_code: input.activationCode,
    });

    return Response.json({ item });
  } catch (error) {
    return toApiErrorResponse(error, {
      defaultMessage: "请求参数不合法",
      notFoundMessage: "Not found",
    });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext<"/api/license/store-accounts/[id]">) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    const exists = await supabaseModels.licenseStoreAccount.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, reminderId: true },
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
