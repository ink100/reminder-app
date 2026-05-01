import { describe, expect, it } from "vitest";

import { getLicenseFileNameFromContentDisposition, normalizeClientKey } from "@/lib/license-key";

describe("normalizeClientKey", () => {
  it("removes whitespace introduced by copy/paste or line wrapping", () => {
    expect(normalizeClientKey("  ABC\nDEF\r\n GHI\tJKL  ")).toBe("ABCDEFGHIJKL");
  });
});

describe("getLicenseFileNameFromContentDisposition", () => {
  it("uses utf-8 filename when available", () => {
    expect(getLicenseFileNameFromContentDisposition("attachment; filename*=UTF-8''%E6%8E%88%E6%9D%83.key")).toBe("授权.key");
  });

  it("uses ascii filename when available", () => {
    expect(getLicenseFileNameFromContentDisposition('attachment; filename="license_123.key"')).toBe("license_123.key");
  });

  it("falls back when header is missing", () => {
    expect(getLicenseFileNameFromContentDisposition(null, "fallback.key")).toBe("fallback.key");
  });
});
