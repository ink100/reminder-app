import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";
import { getTrustedClientIp } from "@/lib/login-throttle";
import { deleteTrustedDeviceCookie, restoreSessionFromTrustedDevice } from "@/lib/trusted-device";

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
  const nextPath = safeNextPath(request.nextUrl.searchParams.get("next"));
  const ipAddress = getTrustedClientIp(request.headers);
  const userAgent = request.headers.get("user-agent");
  const result = await restoreSessionFromTrustedDevice(ipAddress, userAgent);
  if (result.status === "invalid") {
    await deleteTrustedDeviceCookie();
    return NextResponse.redirect(getRedirectUrl(request, "/auth"));
  }
  if (result.status === "session_present") return NextResponse.redirect(getRedirectUrl(request, nextPath));
  if (result.status !== "restored") return NextResponse.redirect(getRedirectUrl(request, "/auth"));

  return NextResponse.redirect(getRedirectUrl(request, nextPath));
}
