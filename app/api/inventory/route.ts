import { requireApiSession } from "@/lib/auth";
import { listInventoryWatches } from "@/lib/inventory-service";

export async function GET() {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await listInventoryWatches();
  return Response.json({ items });
}
