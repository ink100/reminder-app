import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateNotificationApiKey } from "@/lib/notification-center/manager";
import { mirrorNotificationApiKey } from "@/lib/notification-center/supabase-mirror";

const schema = z.object({ name: z.string().min(1).default("Worker Key"), enabled: z.boolean().optional() });

export async function GET() {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const items = await prisma.notificationApiKey.findMany({ orderBy: { id: "desc" } });
  return Response.json({ items: items.map((item) => ({ ...item, apiKey: `${item.apiKey.slice(0, 8)}...${item.apiKey.slice(-4)}`, expiresAt: item.expiresAt?.toISOString() ?? null })) });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const input = schema.parse(await request.json());
  const apiKey = generateNotificationApiKey();
  const item = await prisma.notificationApiKey.create({ data: { name: input.name, apiKey, enabled: input.enabled ?? true } });
  await mirrorNotificationApiKey(item);
  return Response.json({ item: { ...item, apiKey } }, { status: 201 });
}
