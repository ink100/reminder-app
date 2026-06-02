import { type NextRequest, NextResponse } from "next/server";

import { createSession } from "@/lib/session";
import { deleteTrustedDeviceCookie, getValidTrustedDevice } from "@/lib/trusted-device";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/reminders";
  }

  return value;
}

export async function GET(request: NextRequest) {
  const device = await getValidTrustedDevice();
  const nextPath = safeNextPath(request.nextUrl.searchParams.get("next"));

  if (!device) {
    await deleteTrustedDeviceCookie();
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip");
  const userAgent = request.headers.get("user-agent");

  await createSession(ipAddress, userAgent);

  return NextResponse.redirect(new URL(nextPath, request.url));
}
