import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";
import { createSession } from "@/lib/session";
import { deleteTrustedDeviceCookie, getValidTrustedDevice } from "@/lib/trusted-device";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/reminders";
  }

  return value;
}

function getRedirectUrl(request: NextRequest, path: string) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");

  const isLocalHost = host?.startsWith("localhost") || host?.startsWith("127.0.0.1");

  if (host && !isLocalHost) {
    const protocol = forwardedProto === "http" ? "http" : "https";
    return new URL(path, `${protocol}://${host}`);
  }

  return new URL(path, env.APP_BASE_URL);
}

export async function GET(request: NextRequest) {
  const device = await getValidTrustedDevice();
  const nextPath = safeNextPath(request.nextUrl.searchParams.get("next"));

  if (!device) {
    await deleteTrustedDeviceCookie();
    return NextResponse.redirect(getRedirectUrl(request, "/auth"));
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip");
  const userAgent = request.headers.get("user-agent");

  await createSession(device.userId, "trusted_device", ipAddress, userAgent);

  return NextResponse.redirect(getRedirectUrl(request, nextPath));
}
