import crypto from "node:crypto";
import { env } from "@/lib/env";
import { getRequestCookie, setResponseCookie } from "@/lib/http/cookies";

export const WEBAUTHN_CEREMONY_COOKIE = "webauthn_ceremony";

export function newCeremonyBrowserToken() {
  return crypto.randomBytes(32).toString("base64url");
}

/** Reuse the browser-profile binding; ceremonyId isolates individual attempts. */
export function getOrCreateCeremonyBrowserToken(_request?: Request) {
  return getRequestCookie(WEBAUTHN_CEREMONY_COOKIE) ?? newCeremonyBrowserToken();
}

export function ceremonyBrowserToken(_request?: Request) {
  const token = getRequestCookie(WEBAUTHN_CEREMONY_COOKIE);
  if (!token) throw new Error("WebAuthn ceremony cookie is missing");
  return token;
}

export function setCeremonyCookie(token: string) {
  setResponseCookie(WEBAUTHN_CEREMONY_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: env.APP_BASE_URL.startsWith("https://"),
    path: "/api",
    maxAge: 5 * 60,
  });
}
