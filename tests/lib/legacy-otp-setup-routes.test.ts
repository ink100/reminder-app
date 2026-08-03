import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureAppSettings = vi.hoisted(() => vi.fn());
const requireAdminApi = vi.hoisted(() => vi.fn());
const generateOtpSecret = vi.hoisted(() => vi.fn());
const generateOtpSetupPayload = vi.hoisted(() => vi.fn());
const verifyOtpToken = vi.hoisted(() => vi.fn());
const updateAppSettings = vi.hoisted(() => vi.fn());
const upsertTotpFactor = vi.hoisted(() => vi.fn());
const createSession = vi.hoisted(() => vi.fn());
const cookieStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/bootstrap-settings", () => ({ ensureAppSettings }));
vi.mock("@/lib/admin-api", () => ({ requireAdminApi }));
vi.mock("@/lib/crypto", () => ({
  encryptText: vi.fn(() => "encrypted-secret"),
  decryptText: vi.fn(() => "secret"),
}));
vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://example.test" } }));
vi.mock("@/lib/otp", () => ({
  generateOtpSecret,
  generateOtpSetupPayload,
  verifyOtpToken,
}));
vi.mock("@/lib/app-settings/store", () => ({ appSettingStore: { update: updateAppSettings } }));
vi.mock("@/lib/prisma", () => ({ prisma: { userTotpFactor: { upsert: upsertTotpFactor } } }));
vi.mock("@/lib/session", () => ({ createSession }));

import { POST as setupTotp } from "@/server/handlers/api/auth/otp/setup/route";
import { POST as verifySetupTotp } from "@/server/handlers/api/auth/otp/verify-setup/route";

const unavailableResponse = { error: "Legacy TOTP setup is unavailable" };

describe("legacy self-service TOTP setup routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminApi.mockResolvedValue({
      actor: {
        user: { id: "invited-admin", role: "ADMIN", status: "ACTIVE" },
      },
    });
    ensureAppSettings.mockResolvedValue({ otpSecretEncrypted: null });
    generateOtpSecret.mockReturnValue("secret");
    generateOtpSetupPayload.mockResolvedValue({ secret: "secret", qrCodeDataUrl: "data:image/png;base64,safe" });
    cookieStore.get.mockReturnValue({ value: "encrypted-secret" });
    verifyOtpToken.mockResolvedValue(true);
  });

  it("rejects direct setup even for an enrolled invited admin when the legacy global secret is absent", async () => {
    const response = await setupTotp();

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual(unavailableResponse);
    expect(generateOtpSecret).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("rejects direct verification without parsing or writing a replacement factor", async () => {
    const request = {
      headers: new Headers(),
      json: vi.fn(async () => ({ code: "123456" })),
    };

    const response = await verifySetupTotp();

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual(unavailableResponse);
    expect(request.json).not.toHaveBeenCalled();
    expect(updateAppSettings).not.toHaveBeenCalled();
    expect(upsertTotpFactor).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });
});
