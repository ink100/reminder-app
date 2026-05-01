import type { NextRequest } from "next/server";

import { requireApiSession } from "@/lib/auth";
import { toApiErrorResponse } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { inventoryWatchSettingsSchema } from "@/lib/validators/inventory-watch";

export async function PUT(request: NextRequest, context: RouteContext<"/api/inventory/[id]">) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const input = inventoryWatchSettingsSchema.parse(await request.json());
    const item = await prisma.inventoryWatch.update({
      where: { id },
      data: {
        notifyEnabled: input.notifyEnabled,
        minNotifyStock: input.minNotifyStock,
        maxNotifyStock: input.maxNotifyStock,
        notifyCooldownMin: input.notifyCooldownMin,
        changePercent: input.changePercent,
        changePercentAuto: input.changePercentAuto,
      },
    });

    return Response.json({ item });
  } catch (error) {
    return toApiErrorResponse(error, {
      defaultMessage: "请求参数不合法",
      notFoundMessage: "Not found",
    });
  }
}
