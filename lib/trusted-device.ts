import crypto from "node:crypto";
import { cookies } from "next/headers";
import { TRUSTED_DEVICE_COOKIE_NAME, TRUSTED_DEVICE_MAX_AGE_SECONDS } from "@/lib/constants/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

function hashTrustedDeviceToken(token: string) {
  return crypto.createHmac("sha256", env.SESSION_SECRET).update(`trusted-device:${token}`).digest("hex");
}

function getDeviceName(userAgent?: string | null) {
  const ua = userAgent ?? "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone / iPad";
  if (/Android/i.test(ua)) return "Android 设备";
  if (/Windows/i.test(ua)) return "Windows 电脑";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac 电脑";
  if (/Linux/i.test(ua)) return "Linux 设备";
  return "可信设备";
}

export async function createTrustedDevice(userId: string, ipAddress?: string | null, userAgent?: string | null) {
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.trustedDevice.create({
    data: {
      userId,
      tokenHash: hashTrustedDeviceToken(token),
      deviceName: getDeviceName(userAgent),
      userAgent: userAgent ?? undefined,
      ipAddress: ipAddress ?? undefined,
      expiresAt: new Date(Date.now() + TRUSTED_DEVICE_MAX_AGE_SECONDS * 1000),
      lastUsedAt: new Date(),
    },
  });
  const cookieStore = await cookies();
  cookieStore.set(TRUSTED_DEVICE_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.APP_BASE_URL.startsWith("https://"),
    path: "/",
    maxAge: TRUSTED_DEVICE_MAX_AGE_SECONDS,
  });
}

export async function getValidTrustedDevice() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TRUSTED_DEVICE_COOKIE_NAME)?.value;
  if (!token) return null;
  const device = await prisma.trustedDevice.findFirst({
    where: { tokenHash: hashTrustedDeviceToken(token), revokedAt: null, expiresAt: { gt: new Date() } },
    include: { user: true },
  });
  if (!device || device.user.status !== "ACTIVE") {
    cookieStore.delete(TRUSTED_DEVICE_COOKIE_NAME);
    return null;
  }
  await prisma.trustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
  return device;
}

export async function hasTrustedDeviceCookie() {
  const cookieStore = await cookies();
  return Boolean(cookieStore.get(TRUSTED_DEVICE_COOKIE_NAME)?.value);
}

export async function deleteTrustedDeviceCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(TRUSTED_DEVICE_COOKIE_NAME);
}

export async function listTrustedDevices(userId: string) {
  return prisma.trustedDevice.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, deviceName: true, userAgent: true, ipAddress: true, expiresAt: true, lastUsedAt: true, createdAt: true },
  });
}

export async function revokeTrustedDevice(userId: string, id: string) {
  const device = await prisma.trustedDevice.update({ where: { id, userId }, data: { revokedAt: new Date() } });
  const cookieStore = await cookies();
  const currentToken = cookieStore.get(TRUSTED_DEVICE_COOKIE_NAME)?.value;
  if (currentToken && hashTrustedDeviceToken(currentToken) === device.tokenHash) cookieStore.delete(TRUSTED_DEVICE_COOKIE_NAME);
  return device;
}
