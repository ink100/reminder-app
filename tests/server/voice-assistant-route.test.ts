import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireBrowserSession, dispatchRequest, lookup } = vi.hoisted(() => ({ requireBrowserSession: vi.fn(), dispatchRequest: vi.fn(), lookup: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireBrowserSession }));
vi.mock("@/server/http/dispatcher", () => ({ dispatchRequest }));
vi.mock("node:dns/promises", () => ({ lookup, default: { lookup } }));

import { POST } from "@/server/handlers/api/voice/assistant/route";

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/voice/assistant", {
    method: "POST", headers: { "content-type": "application/json", cookie: "session=test-cookie", ...headers },
    body: JSON.stringify(body),
  });
}
const valid = { apiKey: "provider-key", messages: [{ role: "user", content: "列出待办" }] };

describe("voice assistant route", () => {
  beforeEach(() => { requireBrowserSession.mockReset(); dispatchRequest.mockReset().mockResolvedValue(Response.json({ items: [{ id: "todo-1", title: "测试" }] })); lookup.mockReset().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]); vi.restoreAllMocks(); });

  it("rejects cleartext provider URLs before any provider request", async () => {
    requireBrowserSession.mockResolvedValue({ userId: "user-1" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await POST(request({ ...valid, baseUrl: "http://provider.test/v1" }));
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requires only a browser Cookie session and does not pass provider credentials to auth", async () => {
    requireBrowserSession.mockResolvedValue(null);
    const response = await POST(request(valid, { authorization: "Bearer machine-or-provider-key" }));
    expect(response.status).toBe(401);
    expect(requireBrowserSession).toHaveBeenCalledWith();
  });

  it("uses MCP InMemoryTransport to execute the existing todo tool and excludes delete tools", async () => {
    requireBrowserSession.mockResolvedValue({ userId: "user-1" });
    const providerTransport = vi.fn()
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "1", type: "function", function: { name: "list_todos", arguments: "{}" } }] } }] }))
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { role: "assistant", content: "完成" } }] }));

    const response = await POST(request(valid), { providerTransport });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.reply).toBe("完成");
    expect(data.toolCalls[0].name).toBe("list_todos");
    const payload = JSON.parse(providerTransport.mock.calls[0][1]?.body as string);
    const names = payload.tools.map((tool: { function: { name: string } }) => tool.function.name);
    expect(names).not.toContain("create_reminder");
    expect(names).toContain("get_scheduler_status");
    expect(names).not.toContain("delete_reminder");
    expect(names).not.toContain("delete_todo");
  });

  it("defaults to read-only tools and exposes mutations only with explicit authorization", async () => {
    requireBrowserSession.mockResolvedValue({ userId: "user-1" });
    const providerTransport = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { role: "assistant", content: "完成" } }] }));
    await POST(request(valid), { providerTransport });
    let payload = JSON.parse(providerTransport.mock.calls[0][1]?.body as string);
    expect(payload.tools.map((tool: { function: { name: string } }) => tool.function.name)).not.toContain("create_reminder");
    providerTransport.mockClear();
    await POST(request({ ...valid, allowMutations: true }), { providerTransport });
    payload = JSON.parse(providerTransport.mock.calls[0][1]?.body as string);
    expect(payload.tools.map((tool: { function: { name: string } }) => tool.function.name)).toContain("create_reminder");
  });

  it("rejects an oversized chunked request while streaming without Content-Length", async () => {
    requireBrowserSession.mockResolvedValue({ userId: "user-1" });
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(pulls === 1 ? 64 * 1024 : 1)); } });
    const oversized = new Request("https://example.test/api/voice/assistant", { method: "POST", headers: { cookie: "session=test-cookie" }, body, duplex: "half" } as RequestInit & { duplex: string });
    const response = await POST(oversized);
    expect(response.status).toBe(413);
    expect(pulls).toBeGreaterThanOrEqual(2);
  });
});
