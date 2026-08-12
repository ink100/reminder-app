import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAiApiKeySession } = vi.hoisted(() => ({ requireAiApiKeySession: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireAiApiKeySession,
  readApiKeyCredentials: (request: Request) => {
    const authorization = request.headers.get("authorization") ?? "";
    return { key: authorization.replace(/^Bearer\s+/i, "") || null, conflict: false };
  },
}));

import { POST } from "@/server/handlers/api/mcp/route";

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "route-test", version: "1.0.0" },
  },
};

function mcpRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      authorization: "Bearer test-key",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("MCP HTTP route", () => {
  beforeEach(() => requireAiApiKeySession.mockReset());

  it("rejects missing or cookie-only authentication before parsing MCP input", async () => {
    requireAiApiKeySession.mockResolvedValue(null);

    const response = await POST(mcpRequest(initialize));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("accepts an ai:all machine actor and negotiates the MCP protocol", async () => {
    requireAiApiKeySession.mockResolvedValue({ machineActor: true, apiKeyId: "key-1" });

    const response = await POST(mcpRequest(initialize));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body.result.serverInfo.name).toBe("reminder-app");
    expect(body.result.capabilities.tools).toBeTruthy();
  });
});
