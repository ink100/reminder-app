import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stringifyJson } from "@/lib/notification-center/types";
import { mirrorNotificationChannel } from "@/lib/notification-center/supabase-mirror";

const schema = z.object({ type: z.string().min(1), name: z.string().min(1), config: z.record(z.string(), z.unknown()).optional(), enabled: z.boolean().optional() });

export async function GET() {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const items = await prisma.notificationChannel.findMany({ orderBy: { createdAt: "desc" } });
  return Response.json({ items });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const input = schema.parse(await request.json());
  const item = await prisma.notificationChannel.create({ data: { type: input.type, name: input.name, config: stringifyJson(input.config ?? {}), enabled: input.enabled ?? true } });
  await mirrorNotificationChannel(item);
  return Response.json({ item }, { status: 201 });
}
