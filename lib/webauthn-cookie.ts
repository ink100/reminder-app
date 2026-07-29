import crypto from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";

export const WEBAUTHN_CEREMONY_COOKIE = "webauthn_ceremony";

export function newCeremonyBrowserToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function ceremonyBrowserToken(request: NextRequest) {
  const token = request.cookies.get(WEBAUTHN_CEREMONY_COOKIE)?.value;
  if (!token) throw new Error("WebAuthn ceremony cookie is missing");
  return token;
}

export function setCeremonyCookie(response: NextResponse, token: string) {
  response.cookies.set(WEBAUTHN_CEREMONY_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: env.APP_BASE_URL.startsWith("https://"),
    path: "/api",
    maxAge: 5 * 60,
  });
}
