import type { H3Event } from "h3";
import { sendWebResponse, toWebRequest } from "h3";

import { toApiErrorResponse } from "@/lib/api-error";
import { getRequestContext, runWithRequestContext } from "@/server/context/request-context";
import type { RouteDefinition } from "./types";
import { routeRegistry } from "./route-registry";

function safeErrorDetails(error: unknown) {
  if (!(error instanceof Error)) return { name: typeof error };
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  const message = error.message
    .replace(/(?:https?|file|libsql):\/\/\S+/gi, "[REDACTED_URL]")
    .replace(/(?:bearer|token|secret|password|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[REDACTED]");
  return { name: error.name, code, message };
}

function withLegacyRequestProperties(request: Request): Request {
  const compatible = request as Request & { nextUrl?: URL };
  if (!compatible.nextUrl) {
    Object.defineProperty(compatible, "nextUrl", { value: new URL(request.url), enumerable: false });
  }
  return compatible;
}

function appendContextCookies(response: Response, cookies: readonly string[]): Response {
  if (cookies.length === 0) return response;
  const headers = new Headers(response.headers);
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function dispatchRequest(
  request: Request,
  registry: readonly RouteDefinition[] = routeRegistry,
): Promise<Response | undefined> {
  const pathname = new URL(request.url).pathname;
  const method = request.method.toUpperCase();
  let selected: { route: RouteDefinition; params: Record<string, string> } | undefined;

  for (const route of registry) {
    if (route.method !== method) continue;
    const params = route.match(pathname);
    if (params) {
      selected = { route, params };
      break;
    }
  }
  if (!selected) return undefined;

  return runWithRequestContext(request, async () => {
    let response: Response;
    try {
      response = await selected.route.handler(withLegacyRequestProperties(request), {
        params: Promise.resolve(selected.params),
      });
      if (!(response instanceof Response)) throw new TypeError("Route handler did not return a Response");
    } catch (error) {
      console.error("Route handler failed", {
        method: request.method,
        pathname: new URL(request.url).pathname,
        error: safeErrorDetails(error),
      });
      response = toApiErrorResponse(error);
    }
    return appendContextCookies(response, getRequestContext().responseCookies);
  });
}

export async function dispatchEvent(
  event: H3Event,
  registry: readonly RouteDefinition[] = routeRegistry,
): Promise<void | undefined> {
  const response = await dispatchRequest(toWebRequest(event), registry);
  if (!response) return undefined;
  await sendWebResponse(event, response);
}
