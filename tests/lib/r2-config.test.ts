import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/app-settings/store", () => ({
  appSettingStore: { findUnique },
}));

import { getR2Config } from "@/lib/r2-config";

const originalAccessKey = process.env.R2_ACCESS_KEY;
const originalSecretKey = process.env.R2_SECRET_KEY;

function restore(name: "R2_ACCESS_KEY" | "R2_SECRET_KEY", value: string | undefined) {
  if (value === undefined) Reflect.deleteProperty(process.env, name);
  else process.env[name] = value;
}

describe("R2 configuration", () => {
  beforeEach(() => {
    findUnique.mockReset();
    delete process.env.R2_ACCESS_KEY;
    delete process.env.R2_SECRET_KEY;
  });

  afterEach(() => {
    restore("R2_ACCESS_KEY", originalAccessKey);
    restore("R2_SECRET_KEY", originalSecretKey);
  });

  it("fails closed when neither stored nor environment credentials exist", async () => {
    findUnique.mockResolvedValue(null);
    await expect(getR2Config()).rejects.toThrow("R2 credentials are not configured");
  });

  it("uses configured credentials without a source fallback", async () => {
    findUnique.mockResolvedValue({
      r2Endpoint: "https://example.invalid",
      r2AccessKey: "configured-access",
      r2SecretKey: "configured-secret",
      r2Bucket: "configured-bucket",
      r2PublicUrl: "https://cdn.example.invalid",
      r2CacheControl: "private, max-age=60",
    });

    await expect(getR2Config()).resolves.toMatchObject({
      accessKey: "configured-access",
      secretKey: "configured-secret",
      bucket: "configured-bucket",
    });
  });
});
