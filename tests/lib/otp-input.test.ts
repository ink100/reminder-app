import { describe, expect, it } from "vitest";

import { isOtpCodeComplete, normalizeOtpCode } from "@/lib/otp-input";

describe("otp input helpers", () => {
  it("keeps only digits and limits to 6 chars", () => {
    expect(normalizeOtpCode("12ab34-5678")).toBe("123456");
  });

  it("detects complete 6-digit code", () => {
    expect(isOtpCodeComplete("123456")).toBe(true);
    expect(isOtpCodeComplete("12345")).toBe(false);
  });
});
