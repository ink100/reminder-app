import { appSettingStore } from "@/lib/app-settings/store";

const DEFAULTS = {
  endpoint: "https://c587a18930498845b9dcd222bdcd5d8b.r2.cloudflarestorage.com",
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

type R2ConfigSource = {
  r2Endpoint?: string | null;
  r2AccessKey?: string | null;
  r2SecretKey?: string | null;
  r2Bucket?: string | null;
  r2PublicUrl?: string | null;
  r2CacheControl?: string | null;
};

function resolveR2Config(settings?: R2ConfigSource | null): R2Config {
  const config = {
    endpoint: settings?.r2Endpoint || process.env.R2_ENDPOINT || DEFAULTS.endpoint,
    accessKey: settings?.r2AccessKey || process.env.R2_ACCESS_KEY || "",
    secretKey: settings?.r2SecretKey || process.env.R2_SECRET_KEY || "",
    bucket: settings?.r2Bucket || process.env.R2_BUCKET || DEFAULTS.bucket,
    publicUrl: settings?.r2PublicUrl || process.env.R2_PUBLIC_URL || DEFAULTS.publicUrl,
    cacheControl: settings?.r2CacheControl || DEFAULTS.cacheControl,
  };

  if (!config.accessKey || !config.secretKey) {
    throw new Error("R2 credentials are not configured");
  }
  return config;
}

/** 从数据库读取 R2 配置，数据库不可用时仅回退到环境变量。 */
export async function getR2Config(): Promise<R2Config> {
  try {
    const settings = await appSettingStore.findUnique({ where: { id: 1 } });
    return resolveR2Config(settings);
  } catch (error) {
    if (error instanceof Error && error.message === "R2 credentials are not configured") throw error;
    return resolveR2Config();
  }
}

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
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "连接失败" };
  }
}
