import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import path from "path";
import { getR2Config } from "./r2-config";

function makeClient(endpoint: string, accessKey: string, secretKey: string) {
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });
}

function generateUploadPath(originalName: string): string {
  const now = new Date();
  const ext = path.extname(originalName).toLowerCase().replace(".", "") || "png";
  const uuid = randomUUID();
  return `files/${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}/${uuid}.${ext}`;
}

export async function uploadToR2(
  file: Buffer,
  originalName: string,
  mimetype: string
): Promise<{ key: string; url: string }> {
  const cfg = await getR2Config();
  const client = makeClient(cfg.endpoint, cfg.accessKey, cfg.secretKey);
  const key = generateUploadPath(originalName);

  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    Body: file,
    ContentType: mimetype,
    ACL: "public-read",
    CacheControl: cfg.cacheControl,
  });

  await client.send(command);
  return { key, url: `${cfg.publicUrl}/${key}` };
}

export async function deleteFromR2(key: string): Promise<void> {
  const cfg = await getR2Config();
  const client = makeClient(cfg.endpoint, cfg.accessKey, cfg.secretKey);

  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}

export async function purgeCloudflareCache(url: string): Promise<void> {
  void url;
  // CDN cache purge - requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!token || !zoneId) return;
  // implementation unchanged...
}
