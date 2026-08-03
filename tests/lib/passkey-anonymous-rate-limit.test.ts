import { beforeEach, describe, expect, it, vi } from "vitest";

const reserveAnonymousAuthAttempt = vi.hoisted(() => vi.fn());
const generateAuthOptions = vi.hoisted(() => vi.fn());
const verifyAuthResponse = vi.hoisted(() => vi.fn());
vi.mock("@/lib/login-throttle", () => ({ getTrustedClientIp: vi.fn(() => null), reserveAnonymousAuthAttempt }));
vi.mock("@/lib/webauthn", () => ({ generateAuthOptions, verifyAuthResponse }));
vi.mock("@/lib/webauthn-cookie", () => ({
  newCeremonyBrowserToken: vi.fn(() => "browser-secret"), setCeremonyCookie: vi.fn(), ceremonyBrowserToken: vi.fn(() => "browser-secret"),
}));

import { GET } from "@/server/handlers/api/auth/passkey/login/route";
import { POST } from "@/server/handlers/api/auth/passkey/login/verify/route";

describe("anonymous passkey endpoint throttling", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 429 and does not generate options or insert a challenge after reservation is denied", async () => {
    reserveAnonymousAuthAttempt.mockResolvedValue(false);
    const response = await GET({ url: "http://localhost/api/auth/passkey/login", headers: new Headers() } as never);
    expect(response.status).toBe(429);
    expect(generateAuthOptions).not.toHaveBeenCalled();
  });

  it("passes the no-trusted-IP boundary to the durable options bucket", async () => {
    reserveAnonymousAuthAttempt.mockResolvedValue(true);
    generateAuthOptions.mockResolvedValue({ challenge: "public-challenge" });
    const response = await GET({ url: "http://localhost/api/auth/passkey/login", headers: new Headers() } as never);
    expect(response.status).toBe(200);
    expect(reserveAnonymousAuthAttempt).toHaveBeenCalledWith("PASSKEY_OPTIONS", null);
    expect(generateAuthOptions).toHaveBeenCalledTimes(1);
  });

  it("rate-limits verify before parsing or expensive cryptographic verification", async () => {
    reserveAnonymousAuthAttempt.mockResolvedValue(false);
    const request = { headers: new Headers(), json: vi.fn(() => { throw new Error("must not parse"); }) };
    const response = await POST(request as never);
    expect(response.status).toBe(429);
    expect(request.json).not.toHaveBeenCalled();
    expect(verifyAuthResponse).not.toHaveBeenCalled();
    expect(reserveAnonymousAuthAttempt).toHaveBeenCalledWith("PASSKEY_VERIFY", null);
  });
});
