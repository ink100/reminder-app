import { describe, expect, it } from "vitest";

import { normalizeClientKey } from "@/lib/license-key";

describe("normalizeClientKey", () => {
  it("removes whitespace introduced by copy/paste or line wrapping", () => {
    expect(normalizeClientKey("  ABC\nDEF\r\n GHI\tJKL  ")).toBe("ABCDEFGHIJKL");
  });
});
