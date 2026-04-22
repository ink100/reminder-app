import { afterEach, describe, expect, it, vi } from "vitest";
import { generateSync } from "otplib";

import { buildOtpAuthUrl, generateOtpSecret, verifyOtpToken } from "@/lib/otp";

describe("otp helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("generates Google Authenticator compatible otpauth URI", () => {
    const secret = generateOtpSecret();
    const uri = buildOtpAuthUrl(secret);

    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(uri).toContain("issuer=");
    expect(uri).toContain("secret=");
  });

  it("accepts current and previous 30-second window token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:10:00.000Z"));

    const secret = generateOtpSecret();
    const nowToken = generateSync({ secret, strategy: "totp" });
    const prevToken = generateSync({
      secret,
      strategy: "totp",
      epoch: Math.floor(Date.now() / 1000) - 30,
    });

    await expect(verifyOtpToken(secret, nowToken)).resolves.toBe(true);
    await expect(verifyOtpToken(secret, prevToken)).resolves.toBe(true);
    await expect(verifyOtpToken(secret, "000000")).resolves.toBe(false);
  });
});
