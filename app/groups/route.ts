import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({ name: z.string().min(1), description: z.string().optional(), enabled: z.boolean().optional() });

export async function GET() {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const items = await prisma.notificationGroup.findMany({ orderBy: { name: "asc" } });
  return Response.json({ items });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) return Response.json({ error: true, code: "UNAUTHORIZED", message: "Unauthorized" }, { status: 401 });
  const input = schema.parse(await request.json());
  const item = await prisma.notificationGroup.upsert({ where: { name: input.name }, update: { description: input.description ?? null, enabled: input.enabled ?? true }, create: { name: input.name, description: input.description ?? null, enabled: input.enabled ?? true } });
  return Response.json({ item }, { status: 201 });
}
