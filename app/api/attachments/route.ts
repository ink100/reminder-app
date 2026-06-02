import type { NextRequest } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const where: any = {
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
    prisma.attachment.count({ where }),
    prisma.attachment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        reminder: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    }),
  ]);

  // 转换为前端需要的格式
  const formattedItems = items.map((item) => ({
    id: item.id,
    filename: item.filename,
    originalName: item.originalName,
    mimetype: item.mimetype,
    size: item.size,
    url: item.url,
    createdAt: item.createdAt.toISOString(),
    reminderId: item.reminderId,
    reminderTitle: item.reminder?.title || null,
  }));

  return Response.json({
    items: formattedItems,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}
