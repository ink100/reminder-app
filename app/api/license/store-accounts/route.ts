import type { NextRequest } from "next/server";
import { supabaseModels } from "@/lib/reminders/store";

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

  const [items, activationReminders] = await Promise.all([
    supabaseModels.licenseStoreAccount.findMany({
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
    }),
    supabaseModels.reminder.findMany({
      where: {
        deletedAt: null,
        activationCode: { not: null },
      },
      select: {
        id: true,
        title: true,
        dueAt: true,
        activationCode: true,
      },
      orderBy: { dueAt: "asc" },
    }),
  ]);

  return Response.json({ items, activationReminders });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
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

    const item = await supabaseModels.licenseStoreAccount.create({
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
    });

    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { defaultMessage: "请求参数不合法" });
  }
}
