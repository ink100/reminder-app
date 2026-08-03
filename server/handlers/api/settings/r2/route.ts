import { requireAdminApi } from "@/lib/admin-api";
import { appSettingStore } from "@/lib/app-settings/store";
import { getR2Config, testR2Connection } from "@/lib/r2-config";

// 测试 R2 连接
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const session = auth.actor;
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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
    return Response.json(result);
  } catch {
    return Response.json({ success: false, message: "测试失败" });
  }
}

// 保存 R2 配置
export async function PUT(request: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const session = auth.actor;
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    await appSettingStore.update({
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

    return Response.json({ success: true });
  } catch (error) {
    console.error("保存 R2 配置失败:", error);
    return Response.json({ error: "保存失败" }, { status: 500 });
  }
}

// 获取当前 R2 配置
export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const session = auth.actor;
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getR2Config();
  const machineActor = auth.actor.id.startsWith("api-key:");
  return Response.json({
    endpoint: config.endpoint,
    accessKey: machineActor ? "" : config.accessKey,
    secretKey: machineActor ? "" : config.secretKey,
    ...(machineActor ? {
      accessKeyConfigured: Boolean(config.accessKey),
      secretKeyConfigured: Boolean(config.secretKey),
    } : {}),
    bucket: config.bucket,
    publicUrl: config.publicUrl,
    cacheControl: config.cacheControl,
  });
}
