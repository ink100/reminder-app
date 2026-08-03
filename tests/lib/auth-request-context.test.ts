import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  authSession: { findFirst: vi.fn(), deleteMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/env", () => ({ env: {
  SESSION_SECRET: "test-session-secret-long",
  APP_BASE_URL: "https://example.test",
} }));

import { SESSION_COOKIE_NAME, TRUSTED_DEVICE_COOKIE_NAME } from "@/lib/constants/auth";
import { getResponseCookies } from "@/lib/http/cookies";
import { deleteCurrentSession, getCurrentSession, hashSessionToken, setSessionCookie } from "@/lib/session";
import { deleteTrustedDeviceCookie, setTrustedDeviceCookie } from "@/lib/trusted-device";
import {
  ceremonyBrowserToken,
  setCeremonyCookie,
  WEBAUTHN_CEREMONY_COOKIE,
} from "@/lib/webauthn-cookie";
import { runWithRequestContext } from "@/server/context/request-context";

describe("authentication cookies in the Nitro request context", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets, gets, and deletes the session cookie without Next headers", async () => {
    prismaMock.authSession.findFirst.mockResolvedValue({
      id: "session-1",
      securityVersion: 3,
      user: { id: "user-1", status: "ACTIVE", role: "MEMBER", securityVersion: 3 },
    });

    await runWithRequestContext(new Request("https://example.test/api/auth/status", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=incoming-token` },
    }), async () => {
      await expect(getCurrentSession()).resolves.toMatchObject({ id: "session-1" });
      expect(prismaMock.authSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ sessionTokenHash: hashSessionToken("incoming-token") }),
      }));

      await setSessionCookie("replacement-token");
      expect(getResponseCookies()).toEqual([
        expect.stringMatching(new RegExp(`^${SESSION_COOKIE_NAME}=replacement-token; Path=/; Max-Age=\\d+; HttpOnly; Secure; SameSite=Lax$`)),
      ]);

      await deleteCurrentSession();
      expect(prismaMock.authSession.deleteMany).toHaveBeenCalledWith({
        where: { sessionTokenHash: hashSessionToken("incoming-token") },
      });
      expect(getResponseCookies()).toEqual([`${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0`]);
    });
  });

  it("preserves trusted-device and WebAuthn ceremony cookie security attributes", async () => {
    await runWithRequestContext(new Request("https://example.test/api/auth/passkey/login/verify", {
      headers: { cookie: `${WEBAUTHN_CEREMONY_COOKIE}=browser%20token` },
    }), async () => {
      expect(ceremonyBrowserToken()).toBe("browser token");
      await setTrustedDeviceCookie("trusted-token");
      setCeremonyCookie("ceremony-token");

      expect(getResponseCookies()).toEqual([
        expect.stringMatching(new RegExp(`^${TRUSTED_DEVICE_COOKIE_NAME}=trusted-token; Path=/; Max-Age=\\d+; HttpOnly; Secure; SameSite=Lax$`)),
        `${WEBAUTHN_CEREMONY_COOKIE}=ceremony-token; Path=/api; Max-Age=300; HttpOnly; Secure; SameSite=Strict`,
      ]);

      await deleteTrustedDeviceCookie();
      expect(getResponseCookies()).toEqual([
        `${TRUSTED_DEVICE_COOKIE_NAME}=; Path=/; Max-Age=0`,
        `${WEBAUTHN_CEREMONY_COOKIE}=ceremony-token; Path=/api; Max-Age=300; HttpOnly; Secure; SameSite=Strict`,
      ]);
    });
  });

  it("uses the Web standard Response implementation", async () => {
    const response = Response.json({ ok: true }, { status: 202 });
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
