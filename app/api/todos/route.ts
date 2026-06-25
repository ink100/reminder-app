import type { NextRequest } from "next/server";

import { requireApiSession } from "@/lib/auth";
import { toApiErrorResponse } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const todoCreateSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(200),
});

export async function GET() {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const todos = await prisma.todo.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ items: todos.map((t) => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(), completedAt: t.completedAt?.toISOString() ?? null })) });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const input = todoCreateSchema.parse(await request.json());
    const todo = await prisma.todo.create({
      data: { title: input.title },
    });

    return Response.json({ item: { ...todo, createdAt: todo.createdAt.toISOString(), updatedAt: todo.updatedAt.toISOString(), completedAt: null } }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { defaultMessage: "请求参数不合法" });
  }
}
