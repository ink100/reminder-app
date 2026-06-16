import type { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";

import { requireApiSession } from "@/lib/auth";
import { toApiErrorResponse } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { uploadToR2 } from "@/lib/r2-storage";
import { randomUUID } from "crypto";
import path from "path";

// 单文件大小限制 100MB
const MAX_SIZE = 100 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");
  const search = searchParams.get("search") || "";
  const type = searchParams.get("type") || ""; // image / file / all

  const where: Prisma.ImageWhereInput = {
    deletedAt: null,
  };

  if (search) {
    where.originalName = { contains: search };
  }

  if (type === "image") {
    where.mimetype = { startsWith: "image/" };
  } else if (type === "file") {
    where.mimetype = { not: { startsWith: "image/" } };
  }

  const [total, items] = await Promise.all([
    prisma.image.count({ where }),
    prisma.image.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return Response.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "请选择文件" }, { status: 400 });
    }

    // 验证文件大小
    if (file.size > MAX_SIZE) {
      return Response.json({ error: "文件大小超过限制 (100MB)" }, { status: 400 });
    }

    // 读取文件内容
    const buffer = Buffer.from(await file.arrayBuffer());
    const originalName = file.name;
    const ext = path.extname(originalName).toLowerCase().replace(".", "") || "bin";
    const filename = `${randomUUID()}.${ext}`;

    // 上传到 R2
    const { key, url } = await uploadToR2(buffer, originalName, file.type || "application/octet-stream");

    // 保存到数据库
    const item = await prisma.image.create({
      data: {
        filename,
        originalName,
        mimetype: file.type || "application/octet-stream",
        size: file.size,
        r2Key: key,
        url,
      },
    });

    return Response.json({ success: true, data: item }, { status: 201 });
  } catch (error) {
    console.error("上传失败:", error);
    return toApiErrorResponse(error, { defaultMessage: "上传失败" });
  }
}
