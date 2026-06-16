import { createSign, randomUUID } from "crypto";

export type GoogleDriveUploadResult = {
  key: string;
  url: string;
};

const GOOGLE_DRIVE_KEY_PREFIX = "google-drive:";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

type GoogleDriveConfig = {
  clientEmail: string;
  privateKey: string;
  folderId: string;
  publicRead: boolean;
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type DriveCreateResponse = {
  id?: string;
  webViewLink?: string;
  webContentLink?: string;
  error?: {
    message?: string;
  };
};

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function getGoogleDriveConfig(): GoogleDriveConfig | null {
  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!clientEmail || !privateKey || !folderId) {
    return null;
  }

  return {
    clientEmail,
    privateKey,
    folderId,
    publicRead: process.env.GOOGLE_DRIVE_PUBLIC_READ !== "false",
  };
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function createServiceAccountJwt(cfg: GoogleDriveConfig) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: cfg.clientEmail,
      scope: DRIVE_SCOPE,
      aud: TOKEN_URL,
      exp: now + 3600,
      iat: now,
    })
  );
  const unsignedToken = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(unsignedToken).sign(cfg.privateKey);

  return `${unsignedToken}.${base64Url(signature)}`;
}

async function getAccessToken(cfg: GoogleDriveConfig) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const assertion = createServiceAccountJwt(cfg);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const data = (await response.json()) as TokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Google Drive 获取访问令牌失败");
  }

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };

  return cachedToken.accessToken;
}

function getDriveFileId(key: string) {
  if (!key.startsWith(GOOGLE_DRIVE_KEY_PREFIX)) {
    throw new Error("不是 Google Drive 附件 key");
  }

  return key.slice(GOOGLE_DRIVE_KEY_PREFIX.length);
}

function buildMultipartBody(file: Buffer, originalName: string, mimetype: string, folderId: string) {
  const boundary = `reminder-app-${randomUUID()}`;
  const metadata = JSON.stringify({ name: originalName, parents: [folderId] });
  const head = Buffer.from(
    `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimetype}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);

  return {
    boundary,
    body: Buffer.concat([head, file, tail]),
  };
}

export function isGoogleDriveConfigured() {
  return getGoogleDriveConfig() !== null;
}

export function isGoogleDriveKey(key: string) {
  return key.startsWith(GOOGLE_DRIVE_KEY_PREFIX);
}

export async function uploadToGoogleDrive(
  file: Buffer,
  originalName: string,
  mimetype: string
): Promise<GoogleDriveUploadResult> {
  const cfg = getGoogleDriveConfig();
  if (!cfg) {
    throw new Error("Google Drive 后备存储未配置");
  }

  const accessToken = await getAccessToken(cfg);
  const multipart = buildMultipartBody(file, originalName, mimetype, cfg.folderId);
  const createResponse = await fetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,webViewLink,webContentLink`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": `multipart/related; boundary=${multipart.boundary}`,
      },
      body: multipart.body,
    }
  );

  const created = (await createResponse.json()) as DriveCreateResponse;
  if (!createResponse.ok || !created.id) {
    throw new Error(created.error?.message || "Google Drive 上传失败：未返回文件 ID");
  }

  if (cfg.publicRead) {
    const permissionResponse = await fetch(`${DRIVE_API_BASE}/files/${created.id}/permissions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    });

    if (!permissionResponse.ok) {
      throw new Error("Google Drive 上传成功，但设置公开读取权限失败");
    }
  }

  const key = `${GOOGLE_DRIVE_KEY_PREFIX}${created.id}`;
  const url = cfg.publicRead
    ? `https://drive.google.com/uc?id=${encodeURIComponent(created.id)}&export=download`
    : `https://drive.google.com/file/d/${encodeURIComponent(created.id)}/view`;

  return { key, url };
}

export async function deleteFromGoogleDrive(key: string): Promise<void> {
  const cfg = getGoogleDriveConfig();
  if (!cfg) {
    throw new Error("Google Drive 后备存储未配置");
  }

  const accessToken = await getAccessToken(cfg);
  const fileId = getDriveFileId(key);
  const response = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error("Google Drive 删除文件失败");
  }
}
