import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = {
  request: Request;
  requestCookies: Map<string, string>;
  responseCookies: string[];
};

const storage = new AsyncLocalStorage<RequestContext>();

function parseCookieHeader(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (!name) continue;
    const rawValue = part.slice(separator + 1).trim();
    try {
      cookies.set(name, decodeURIComponent(rawValue));
    } catch {
      cookies.set(name, rawValue);
    }
  }
  return cookies;
}

export function createRequestContext(request: Request): RequestContext {
  return {
    request,
    requestCookies: parseCookieHeader(request.headers.get("cookie")),
    responseCookies: [],
  };
}

export function runWithRequestContext<T>(request: Request, callback: () => T): T {
  return storage.run(createRequestContext(request), callback);
}

export function getRequestContext(): RequestContext {
  const context = storage.getStore();
  if (!context) throw new Error("No active request context");
  return context;
}

export function getOptionalRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
