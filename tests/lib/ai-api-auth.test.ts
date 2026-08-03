import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSession = vi.hoisted(() => vi.fn());
const validateNotificationApiKey = vi.hoisted(() => vi.fn());
const findFirstAdmin = vi.hoisted(() => vi.fn());

vi.mock("@/lib/session", () => ({ getCurrentSession }));
vi.mock("@/lib/trusted-device", () => ({ hasTrustedDeviceCookie: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findFirst: findFirstAdmin } } }));
vi.mock("@/lib/notification-center/manager", () => ({
  AI_ALL_SCOPE: "ai:all",
  notificationApiKeyScopes: (record: { scopes?: unknown }) => Array.isArray(record.scopes) ? record.scopes : ["notifications:send"],
  validateNotificationApiKey,
}));

import { readApiKeyCredentials, requireApiSession } from "@/lib/auth";

const admin = {
  id: "admin-1", role: "ADMIN", status: "ACTIVE", securityVersion: 3,
};

describe("AI API authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirstAdmin.mockResolvedValue(admin);
  });

  it("rejects conflicting Bearer and X-API-Key credentials without cookie fallback", async () => {
    const request = new Request("https://test/api/reminders", {
      headers: { authorization: "Bearer first", "x-api-key": "second" },
    });
    expect(readApiKeyCredentials(request)).toEqual({ key: "first", conflict: true });
    await expect(requireApiSession(request)).resolves.toBeNull();
    expect(validateNotificationApiKey).not.toHaveBeenCalled();
    expect(getCurrentSession).not.toHaveBeenCalled();
  });

  it("accepts matching Bearer and X-API-Key as one credential", () => {
    const request = new Request("https://test", {
      headers: { authorization: "Bearer same-key", "x-api-key": "same-key" },
    });
    expect(readApiKeyCredentials(request)).toEqual({ key: "same-key", conflict: false });
  });

  it("does not grant ai:all to a legacy worker key with missing scopes", async () => {
    validateNotificationApiKey.mockResolvedValue({ id: "worker-1", enabled: true });
    await expect(requireApiSession(new Request("https://test", { headers: { "x-api-key": "legacy" } }))).resolves.toBeNull();
    expect(findFirstAdmin).not.toHaveBeenCalled();
  });

  it("returns a marked machine actor for an AI key", async () => {
    validateNotificationApiKey.mockResolvedValue({ id: "ai-key-1", enabled: true, scopes: ["ai:all"] });
    const actor = await requireApiSession(new Request("https://test", { headers: { authorization: "Bearer ai-secret" } }));
    expect(actor).toMatchObject({
      id: "api-key:ai-key-1",
      userId: "admin-1",
      user: admin,
      authMethod: "api_key",
      machineActor: true,
      apiKeyId: "ai-key-1",
    });
    expect(getCurrentSession).not.toHaveBeenCalled();
  });
});
