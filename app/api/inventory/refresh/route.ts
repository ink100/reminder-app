import { requireApiSession } from "@/lib/auth";
import { toApiErrorResponse } from "@/lib/api-error";
import { syncInventoryWatches } from "@/lib/inventory-service";

export async function POST() {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const items = await syncInventoryWatches();
    return Response.json({ items });
  } catch (error) {
    return toApiErrorResponse(error, { internalMessage: error instanceof Error ? error.message : "库存刷新失败" });
  }
}
