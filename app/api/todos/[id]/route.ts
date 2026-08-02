import type { NextRequest } from "next/server";

import { requireApiSession } from "@/lib/auth";
import { toApiErrorResponse } from "@/lib/api-error";
import { todoStore } from "@/lib/reminders/store";
import { z } from "zod";

const todoUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  completed: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(request);

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const existing = await todoStore.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      return Response.json({ error: "Not Found" }, { status: 404 });
    }

    const input = todoUpdateSchema.parse(await request.json());

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.completed !== undefined) {
      data.completedAt = input.completed ? new Date() : null;
    }

    const todo = await todoStore.update({
      where: { id },
      data,
    });

    return Response.json({
      item: {
        ...todo,
        createdAt: todo.createdAt.toISOString(),
        updatedAt: todo.updatedAt.toISOString(),
        completedAt: todo.completedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return toApiErrorResponse(error, { defaultMessage: "请求参数不合法" });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession(_request);

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await todoStore.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    return Response.json({ error: "Not Found" }, { status: 404 });
  }

  await todoStore.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return Response.json({ ok: true });
}
