import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadToR2 } from "@/lib/r2-storage";

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const reminderId = formData.get("reminderId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "没有文件" }, { status: 400 });
    }

    // 100MB 限制
    if (file.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: "文件不能超过 100MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { key, url } = await uploadToR2(buffer, file.name, file.type || "application/octet-stream");

    const attachment = await prisma.attachment.create({
      data: {
        filename: key.split("/").pop() || file.name,
        originalName: file.name,
        mimetype: file.type || "application/octet-stream",
        size: file.size,
        r2Key: key,
        url,
        reminderId: reminderId || null,
      },
    });

    return NextResponse.json({ item: attachment });
  } catch (error) {
    console.error("上传失败:", error);
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const reminderId = searchParams.get("reminderId");

  const where: Prisma.AttachmentWhereInput = { deletedAt: null };
  if (reminderId) {
    where.reminderId = reminderId;
  }

  const attachments = await prisma.attachment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ items: attachments });
}
