import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteFromR2 } from "@/lib/r2-storage";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const attachment = await prisma.attachment.findUnique({ where: { id } });

    if (!attachment || attachment.deletedAt) {
      return NextResponse.json({ error: "附件不存在" }, { status: 404 });
    }

    await deleteFromR2(attachment.r2Key);

    await prisma.attachment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除附件失败:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
