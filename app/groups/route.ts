import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { eq, insertRow, newId, NotificationGroupRow, selectOne, selectRows } from "@/lib/notification-center/store";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
  enabled: z.boolean().optional(),
});

export async function GET() {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const items = await selectRows<NotificationGroupRow>("notification_groups", { order: "name.asc" });
  return Response.json({ items });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: true, code: "INVALID_GROUP", message: "分组参数不合法" }, { status: 400 });
  const input = parsed.data;
  const existing = await selectOne<NotificationGroupRow>("notification_groups", { filters: { name: eq(input.name) } });
  if (existing) return Response.json({ error: true, code: "GROUP_NAME_EXISTS", message: "分组名称已存在" }, { status: 409 });
  const item = await insertRow<NotificationGroupRow>("notification_groups", {
    id: newId("ng"),
    name: input.name,
    description: input.description ?? null,
    enabled: input.enabled ?? true,
  });
  return Response.json({ item }, { status: 201 });
}
