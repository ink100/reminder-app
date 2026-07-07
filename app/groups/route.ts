import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { eq, insertRow, newId, NotificationGroupRow, selectOne, selectRows, updateRows } from "@/lib/notification-center/store";

const schema = z.object({ name: z.string().min(1), description: z.string().optional(), enabled: z.boolean().optional() });

export async function GET() {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const items = await selectRows<NotificationGroupRow>("notification_groups", { order: "name.asc" });
  return Response.json({ items });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const input = schema.parse(await request.json());
  const existing = await selectOne<NotificationGroupRow>("notification_groups", { filters: { name: eq(input.name) } });
  const item = existing
    ? (await updateRows<NotificationGroupRow>("notification_groups", { id: eq(existing.id) }, { description: input.description ?? null, enabled: input.enabled ?? true }))[0] ?? existing
    : await insertRow<NotificationGroupRow>("notification_groups", { id: newId("ng"), name: input.name, description: input.description ?? null, enabled: input.enabled ?? true });
  return Response.json({ item }, { status: 201 });
}
