
import { env } from "@/lib/env";
import { getTrustedClientIp } from "@/lib/login-throttle";
import { deleteTrustedDeviceCookie, restoreSessionFromTrustedDevice } from "@/lib/trusted-device";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/reminders";
  }

  return value;
}

function failedRestorePath(nextPath: string) {
  const query = new URLSearchParams({ trustedRestore: "failed", returnUrl: nextPath });
  return `/auth?${query.toString()}`;
}

function getRedirectUrl(request: Request, path: string) {
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

export async function GET(request: Request) {
  const nextPath = safeNextPath(new URL(request.url).searchParams.get("next"));
  const ipAddress = getTrustedClientIp(request.headers);
  const userAgent = request.headers.get("user-agent");
  const result = await restoreSessionFromTrustedDevice(ipAddress, userAgent);
  if (result.status === "invalid") {
    await deleteTrustedDeviceCookie();
    return Response.redirect(getRedirectUrl(request, failedRestorePath(nextPath)));
  }
  if (result.status === "session_present") return Response.redirect(getRedirectUrl(request, nextPath));
  if (result.status !== "restored") return Response.redirect(getRedirectUrl(request, failedRestorePath(nextPath)));

  return Response.redirect(getRedirectUrl(request, nextPath));
}
