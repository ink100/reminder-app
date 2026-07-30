import type { NextRequest } from "next/server";
import { createCuid, supabaseModels } from "@/lib/reminders/store";
import { callRpc } from "@/lib/notification-center/store";

import { requireAdminApi } from "@/lib/admin-api";
import { toApiErrorResponse } from "@/lib/api-error";
import { licenseStoreAccountInputSchema } from "@/lib/validators/license-store-account";

function buildSearchWhere(search: string) {
  const keyword = search.trim();
  if (!keyword) {
    return { deletedAt: null };
  }

  return {
    deletedAt: null,
    OR: [
      { shopName: { contains: keyword } },
      { phone: { contains: keyword } },
      { remoteCode: { contains: keyword } },
      { activationCode: { contains: keyword } },
    ],
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  const search = request.nextUrl.searchParams.get("q") ?? "";

  const items = await supabaseModels.licenseStoreAccount.findMany({
    where: buildSearchWhere(search),
    include: {
      reminder: {
        select: {
          id: true,
          title: true,
          dueAt: true,
          activationCode: true,
          deletedAt: true,
        },
      },
    },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
  });

  return Response.json({ items });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const input = licenseStoreAccountInputSchema.parse(await request.json());
    const accountId = createCuid();
    const item = await callRpc<Record<string, unknown>>("create_license_store_account_with_reminder", {
      p_account_id: accountId,
      p_reminder_id: createCuid(),
      p_shop_name: input.shopName,
      p_phone: input.phone,
      p_remote_code: input.remoteCode,
      p_remote_password: input.remotePassword,
      p_is_other_account: input.isOtherAccount,
      p_expires_at: input.expiresAt.toISOString(),
      p_activation_code: input.activationCode,
    });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { defaultMessage: "请求参数不合法" });
  }
}
