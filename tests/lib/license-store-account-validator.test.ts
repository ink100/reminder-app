import { describe, expect, it } from "vitest";

import { licenseStoreAccountInputSchema } from "@/lib/validators/license-store-account";

const baseInput = {
  shopName: "测试店铺",
  phone: "13800138000",
  remoteCode: "remote-code",
  remotePassword: "remote-password",
  isOtherAccount: false,
  expiresAt: "2026-08-01T08:00:00.000Z",
  reminderId: null,
};

describe("licenseStoreAccountInputSchema", () => {
  it("accepts a 4096-character activation code without truncating it", () => {
    const activationCode = "A".repeat(4096);

    const result = licenseStoreAccountInputSchema.parse({
      ...baseInput,
      activationCode,
    });

    expect(result.activationCode).toHaveLength(4096);
  });

  it("rejects activation codes longer than 8192 characters", () => {
    expect(() => licenseStoreAccountInputSchema.parse({
      ...baseInput,
      activationCode: "A".repeat(8193),
    })).toThrow("对应激活码过长");
  });
});
