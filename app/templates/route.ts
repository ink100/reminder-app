import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({ name: z.string().min(1), channel_type: z.string().min(1), content: z.string().min(1), enabled: z.boolean().optional() });

export async function GET() {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const items = await prisma.notificationTemplate.findMany({ orderBy: { name: "asc" } });
  return Response.json({ items });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const input = schema.parse(await request.json());
  const item = await prisma.notificationTemplate.create({ data: { name: input.name, channelType: input.channel_type, content: input.content, enabled: input.enabled ?? true } });
  return Response.json({ item }, { status: 201 });
}
