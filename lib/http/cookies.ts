import { getRequestContext } from "@/server/context/request-context";

export type SameSite = "lax" | "strict" | "none";

export type CookieOptions = {
  path?: string;
  domain?: string;
  expires?: Date;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: SameSite;
};

function encode(value: string): string {
  return encodeURIComponent(value);
}

function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const parts = [`${name}=${encode(value)}`];
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.trunc(options.maxAge)}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`);
  return parts.join("; ");
}

function cookieIdentity(serialized: string): string {
  const [pair, ...attributes] = serialized.split(";");
  const name = pair.slice(0, pair.indexOf("=")).trim().toLowerCase();
  const path = attributes.find((attribute) => attribute.trim().toLowerCase().startsWith("path="))?.trim().slice(5) ?? "";
  const domain = attributes.find((attribute) => attribute.trim().toLowerCase().startsWith("domain="))?.trim().slice(7).toLowerCase() ?? "";
  return `${name}\n${domain}\n${path}`;
}

export function getRequestCookie(name: string): string | undefined {
  return getRequestContext().requestCookies.get(name);
}

export function getResponseCookies(): readonly string[] {
  return [...getRequestContext().responseCookies];
}

export function setResponseCookie(name: string, value: string, options: CookieOptions = {}): void {
  if (!name || /[=;\s]/.test(name)) throw new TypeError("Invalid cookie name");
  const context = getRequestContext();
  const serialized = serializeCookie(name, value, options);
  const identity = cookieIdentity(serialized);
  const existing = context.responseCookies.findIndex((cookie) => cookieIdentity(cookie) === identity);
  if (existing >= 0) context.responseCookies[existing] = serialized;
  else context.responseCookies.push(serialized);
}

export function deleteResponseCookie(name: string, options: CookieOptions = {}): void {
  setResponseCookie(name, "", { ...options, expires: undefined, maxAge: 0 });
}
