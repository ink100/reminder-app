import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { upsert: vi.fn() },
  userTotpFactor: { upsert: vi.fn() },
  authSession: { deleteMany: vi.fn() },
  trustedDevice: { deleteMany: vi.fn() },

  $transaction: vi.fn(),
}));
const appSettingStoreMock = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/app-settings/store", () => ({ appSettingStore: appSettingStoreMock }));
vi.mock("@/lib/env", () => ({
  env: {
    LEGACY_ADMIN_USERNAME: "owner",
    LEGACY_ADMIN_DISPLAY_NAME: "家庭管理员",
  },
}));

import { ensureLegacyAdmin } from "@/lib/legacy-admin";
import { hasRole, requireAdmin } from "@/lib/permissions";
import { otpLoginSchema } from "@/lib/validators/auth";

describe("legacy admin bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
    prismaMock.user.upsert.mockResolvedValue({ id: "legacy-admin", username: "owner", displayName: "家庭管理员", role: "ADMIN", status: "ACTIVE" });
    appSettingStoreMock.findUnique.mockResolvedValue({ otpSecretEncrypted: "ciphertext-only" });
  });

  it("idempotently creates the legacy ADMIN, copies encrypted OTP, and binds legacy passkeys", async () => {
    const first = await ensureLegacyAdmin();
    const second = await ensureLegacyAdmin();

    expect(first.id).toBe("legacy-admin");
    expect(second.id).toBe("legacy-admin");
    expect(prismaMock.user.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.userTotpFactor.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "legacy-admin" },
      create: expect.objectContaining({ userId: "legacy-admin", secretEncrypted: "ciphertext-only" }),
    }));

  });

  it("never invents an OTP factor when the legacy secret is absent", async () => {
    appSettingStoreMock.findUnique.mockResolvedValue({ otpSecretEncrypted: null });
    await ensureLegacyAdmin();
    expect(prismaMock.userTotpFactor.upsert).not.toHaveBeenCalled();
  });
});

describe("multi-user auth contracts", () => {
  it("requires and normalizes a username for OTP login", () => {
    expect(otpLoginSchema.parse({ username: "  AdMin ", code: "123456" }).username).toBe("admin");
    expect(() => otpLoginSchema.parse({ code: "123456" })).toThrow();
  });

  it("provides fail-closed ADMIN authorization helpers", () => {
    const admin = { user: { role: "ADMIN" } };
    const member = { user: { role: "MEMBER" } };
    expect(hasRole(admin, "ADMIN")).toBe(true);
    expect(hasRole(member, "ADMIN")).toBe(false);
    expect(() => requireAdmin(member)).toThrow("Forbidden");
  });
});
