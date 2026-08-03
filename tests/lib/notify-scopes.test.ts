import { beforeEach, describe, expect, it, vi } from "vitest";

const validateNotificationApiKey = vi.hoisted(() => vi.fn());
const createNotificationFromEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/notification-center/manager", () => ({
  NOTIFICATION_SEND_SCOPE: "notifications:send",
  notificationApiKeyScopes: (record: { scopes?: unknown }) => {
    if (record.scopes === undefined || record.scopes === null) return ["notifications:send"];
    if (!Array.isArray(record.scopes) || !record.scopes.every(
      (scope) => scope === "notifications:send" || scope === "ai:all",
    )) return [];
    return record.scopes;
  },
  validateNotificationApiKey,
  createNotificationFromEvent,
}));

import { POST } from "@/server/handlers/notify/route";

function request() {
  return new Request("https://test/notify", {
    method: "POST",
    headers: { "x-api-key": "test-key", "content-type": "application/json" },
    body: JSON.stringify({ group: "server", event_type: "test", title: "Test" }),
  });
}

describe("POST /notify scope authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createNotificationFromEvent.mockResolvedValue({
      notification: { id: "notification-1" },
      duplicate: false,
    });
  });

  it.each([
    ["empty scopes", { scopes: [] }],
    ["AI-only scopes", { scopes: ["ai:all"] }],
    ["non-array scopes", { scopes: "notifications:send" }],
    ["mixed malformed scopes", { scopes: ["notifications:send", 1] }],
    ["unknown scopes", { scopes: ["notifications:send", "unknown"] }],
  ])("rejects %s", async (_label, apiKey) => {
    validateNotificationApiKey.mockResolvedValue(apiKey);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(createNotificationFromEvent).not.toHaveBeenCalled();
  });

  it("allows a legacy key with no scopes field", async () => {
    validateNotificationApiKey.mockResolvedValue({ id: "legacy-key", enabled: true });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(createNotificationFromEvent).toHaveBeenCalledOnce();
  });
});
