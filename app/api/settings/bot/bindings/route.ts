import type { NextRequest } from "next/server";

import { requireAdminApi } from "@/lib/admin-api";
import { toApiErrorResponse } from "@/lib/api-error";
import { getActiveBindings, createBindCode, unbindChatId } from "@/lib/telegram-binding";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const session = auth.actor;
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bindings = await getActiveBindings();
  return Response.json({ items: bindings });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  const session = auth.actor;
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string; chatId?: string };

    switch (body.action) {
      case "create-code": {
        const { code, expiresAt } = await createBindCode();
        return Response.json({
          success: true,
          code,
          expiresAt: expiresAt.toISOString(),
          instructions: `在 Telegram 中向 Bot 发送 /bind ${code}`,
        });
      }

      case "unbind": {
        if (!body.chatId) {
          return Response.json({ error: "缺少 chatId" }, { status: 400 });
        }
        await unbindChatId(body.chatId);
        return Response.json({ success: true });
      }

      default:
        return Response.json({ error: "未知操作" }, { status: 400 });
    }
  } catch (error) {
    return toApiErrorResponse(error, { defaultMessage: "操作失败" });
  }
}
