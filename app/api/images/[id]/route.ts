import type { NextRequest } from "next/server";

import { requireApiSession } from "@/lib/auth";
import { toApiErrorResponse } from "@/lib/api-error";
import { imageStore } from "@/lib/reminders/store";
import { deleteFromR2 } from "@/lib/r2-storage";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;

    const image = await imageStore.findUnique({
      where: { id },
    });

    if (!image || image.deletedAt) {
      return Response.json({ error: "图片不存在" }, { status: 404 });
    }

    // 从 R2 删除
    await deleteFromR2(image.r2Key);

    // 软删除数据库记录
    await imageStore.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("删除失败:", error);
    return toApiErrorResponse(error, { defaultMessage: "删除失败" });
  }
}
