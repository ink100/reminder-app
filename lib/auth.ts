import { getCurrentSession } from "@/lib/session";
import { hasTrustedDeviceCookie } from "@/lib/trusted-device";
import { prisma } from "@/lib/prisma";
import { AI_ALL_SCOPE, notificationApiKeyScopes, validateNotificationApiKey } from "@/lib/notification-center/manager";

export class PageRedirectError extends Error {
  readonly location: string;

  constructor(location: string) {
    super(`Redirect to ${location}`);
    this.name = "PageRedirectError";
    this.location = location;
  }
}

function redirect(location: string): never {
  throw new PageRedirectError(location);
}

export async function requirePageSession() {
  const session = await getCurrentSession();

  if (!session) {
    if (await hasTrustedDeviceCookie()) {
      redirect("/api/auth/trusted/restore?next=/reminders");
    }

    redirect("/auth");
  }

  return session;
}

export function readApiKeyCredentials(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const separator = authorization.search(/[\t ]/);
  const scheme = separator < 0 ? authorization : authorization.slice(0, separator);
  const bearer = scheme.toLowerCase() === "bearer" && separator >= 0
    ? authorization.slice(separator + 1).trim() || null
    : null;
  const header = request.headers.get("x-api-key")?.trim() || null;
  return { key: bearer ?? header, conflict: Boolean(bearer && header && bearer !== header) };
}

async function machineAdminSession(apiKey: string) {
  const record = await validateNotificationApiKey(apiKey);
  if (!record || !notificationApiKeyScopes(record).includes(AI_ALL_SCOPE)) return null;
  // Business-route compatibility only: use an active ADMIN as the relational audit principal.
  // Machine actors must never be admitted to identity, invitation, or credential-management routes.
  const user = await prisma.user.findFirst({ where: { role: "ADMIN", status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!user) return null;
  const now = new Date();
  return {
    id: `api-key:${record.id}`, userId: user.id, user, authMethod: "api_key",
    securityVersion: user.securityVersion, sessionTokenHash: "",
    expiresAt: record.expires_at ? new Date(record.expires_at) : new Date(8640000000000000),
    ipAddress: null, userAgent: "AI API Key", trustedDeviceId: null,
    createdAt: now, lastSeenAt: now, machineActor: true as const, apiKeyId: record.id,
  };
}

export async function requireAiApiKeySession(request: Request) {
  const credentials = readApiKeyCredentials(request);
  if (credentials.conflict || !credentials.key) return null;
  return machineAdminSession(credentials.key);
}

export async function requireApiSession(request?: Request) {
  if (request) {
    const credentials = readApiKeyCredentials(request);
    if (credentials.conflict) return null;
    if (credentials.key) return requireAiApiKeySession(request);
  }
  const session = await getCurrentSession();

  if (!session) {
    return null;
  }

  return session;
}

/** Cookie-only session guard for browser business routes that must never accept machine keys. */
export async function requireBrowserSession() {
  return getCurrentSession();
}

export async function requireAdminApiSession() {
  const session = await getCurrentSession();
  return session?.user.role === "ADMIN" ? session : null;
}

export async function requireAdminPage() {
  const session = await requirePageSession();
  if (session.user.role !== "ADMIN") redirect("/reminders");
  return session;
}
