import { prisma } from "@/lib/prisma";

// 默认 R2 配置（兜底用）
const DEFAULTS = {
  endpoint: "https://c587a18930498845b9dcd222bdcd5d8b.r2.cloudflarestorage.com",
  accessKey: "aedbafe12675879eca555accd95aba92",
  secretKey: "aba35e27220acfdeb80e359d67eac52a276a4f796d2bacb06a3538b5c8e025f6",
  bucket: "storage-r2-1",
  publicUrl: "https://img.daydreams.cn",
  cacheControl: "public, max-age=86400",
};

export interface R2Config {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  publicUrl: string;
  cacheControl: string;
}

/**
 * 从数据库读取 R2 配置，未配置则使用环境变量/默认值
 */
export async function getR2Config(): Promise<R2Config> {
  try {
    const settings = await prisma.appSetting.findUnique({ where: { id: 1 } });

    return {
      endpoint: settings?.r2Endpoint || process.env.R2_ENDPOINT || DEFAULTS.endpoint,
      accessKey: settings?.r2AccessKey || process.env.R2_ACCESS_KEY || DEFAULTS.accessKey,
      secretKey: settings?.r2SecretKey || process.env.R2_SECRET_KEY || DEFAULTS.secretKey,
      bucket: settings?.r2Bucket || process.env.R2_BUCKET || DEFAULTS.bucket,
      publicUrl: settings?.r2PublicUrl || process.env.R2_PUBLIC_URL || DEFAULTS.publicUrl,
      cacheControl: settings?.r2CacheControl || DEFAULTS.cacheControl,
    };
  } catch {
    return {
      endpoint: process.env.R2_ENDPOINT || DEFAULTS.endpoint,
      accessKey: process.env.R2_ACCESS_KEY || DEFAULTS.accessKey,
      secretKey: process.env.R2_SECRET_KEY || DEFAULTS.secretKey,
      bucket: process.env.R2_BUCKET || DEFAULTS.bucket,
      publicUrl: process.env.R2_PUBLIC_URL || DEFAULTS.publicUrl,
      cacheControl: DEFAULTS.cacheControl,
    };
  }
}

/**
 * 测试 R2 连接
 */
export async function testR2Connection(config: R2Config): Promise<{ success: boolean; message: string }> {
  try {
    const { S3Client, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
    });

    const command = new ListObjectsV2Command({
      Bucket: config.bucket,
      MaxKeys: 1,
    });

    await client.send(command);
    return { success: true, message: "连接成功" };
  } catch (error: any) {
    return { success: false, message: error.message || "连接失败" };
  }
}
