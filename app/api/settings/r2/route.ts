import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getR2Config, testR2Connection } from "@/lib/r2-config";

// 测试 R2 连接
export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const config = {
      endpoint: body.endpoint || "",
      accessKey: body.accessKey || "",
      secretKey: body.secretKey || "",
      bucket: body.bucket || "",
      publicUrl: "",
      cacheControl: "",
    };
    const result = await testR2Connection(config);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ success: false, message: "测试失败" });
  }
}

// 保存 R2 配置
export async function PUT(request: NextRequest) {
  const session = await requireApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    await prisma.appSetting.update({
      where: { id: 1 },
      data: {
        r2Endpoint: body.endpoint?.trim() || null,
        r2AccessKey: body.accessKey?.trim() || null,
        r2SecretKey: body.secretKey?.trim() || null,
        r2Bucket: body.bucket?.trim() || null,
        r2PublicUrl: body.publicUrl?.trim() || null,
        r2CacheControl: body.cacheControl?.trim() || "public, max-age=86400",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("保存 R2 配置失败:", error);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}

// 获取当前 R2 配置
export async function GET() {
  const session = await requireApiSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getR2Config();
  return NextResponse.json({
    endpoint: config.endpoint,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
    bucket: config.bucket,
    publicUrl: config.publicUrl,
    cacheControl: config.cacheControl,
  });
}
