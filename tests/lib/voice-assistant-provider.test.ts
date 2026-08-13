import { describe, expect, it, vi } from "vitest";

import { MAX_PROVIDER_BYTES, pinnedLookup, readProviderCompletion, runVoiceAssistant, validateProviderUrl } from "@/lib/voice/assistant";

const publicResolver = vi.fn(async () => ["93.184.216.34"]);
const baseInput = {
  baseUrl: "https://provider.test/v1/", apiKey: "provider-secret", model: "custom-model",
  systemPrompt: "system", messages: [{ role: "user" as const, content: "有什么待办" }],
  tools: [{ name: "list_todos", description: "列出待办", inputSchema: { type: "object", properties: {} } }],
  resolver: publicResolver,
};

function toolCompletion(count = 1) {
  return Response.json({ choices: [{ message: { role: "assistant", content: null, tool_calls: Array.from({ length: count }, (_, index) => ({ id: `call-${index}`, type: "function", function: { name: "list_todos", arguments: "{}" } })) } }] });
}

describe("voice assistant provider security", () => {
  it.each([
    ["http://provider.test/v1", ["93.184.216.34"]],
    ["https://localhost/v1", ["93.184.216.34"]],
    ["https://api.localhost/v1", ["93.184.216.34"]],
    ["https://127.0.0.1/v1", ["127.0.0.1"]],
    ["https://10.0.0.1/v1", ["10.0.0.1"]],
    ["https://169.254.169.254/v1", ["169.254.169.254"]],
    ["https://[::1]/v1", ["::1"]],
    ["https://[fe80::1]/v1", ["fe80::1"]],
    ["https://[ff02::1]/v1", ["ff02::1"]],
    ["https://[2001:db8::1]/v1", ["2001:db8::1"]],
  ])("rejects unsafe provider URL %s", async (url, addresses) => {
    await expect(validateProviderUrl(url, async () => addresses)).rejects.toThrow(/HTTPS|不安全/);
  });

  it("rejects a hostname when any resolved address is private", async () => {
    await expect(validateProviderUrl("https://provider.test", async () => ["93.184.216.34", "192.168.1.2"])).rejects.toThrow("不安全");
  });

  it("returns exact validated addresses and pins lookup to only those records", async () => {
    const validated = await validateProviderUrl("https://provider.test/v1", async () => ["8.8.8.8", "2606:4700:4700::1111"]);
    expect(validated.addresses).toEqual(["8.8.8.8", "2606:4700:4700::1111"]);
    const lookup = pinnedLookup(validated.addresses);
    await new Promise<void>((resolve, reject) => lookup("provider.test", { all: true }, (error, records) => {
      if (error) return reject(error);
      expect(records).toEqual([{ address: "8.8.8.8", family: 4 }, { address: "2606:4700:4700::1111", family: 6 }]);
      resolve();
    }));
  });

  it("validates DNS before every request and disallows redirects", async () => {
    const resolver = vi.fn(async () => ["93.184.216.34"]);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(toolCompletion())
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { role: "assistant", content: "完成" } }] }));
    await runVoiceAssistant({ ...baseInput, resolver, fetchImpl, callTool: vi.fn().mockResolvedValue({ ok: true }) });
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: "error" });
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ redirect: "error" });
  });

  it("pins each request and rejects DNS rebinding before another request", async () => {
    const resolver = vi.fn().mockResolvedValueOnce(["8.8.8.8"]).mockResolvedValueOnce(["127.0.0.1"]);
    const transport = vi.fn().mockResolvedValue(toolCompletion());
    await expect(runVoiceAssistant({ ...baseInput, resolver, transport, callTool: vi.fn().mockResolvedValue({ ok: true }) })).rejects.toThrow("不安全");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][2]).toEqual(["8.8.8.8"]);
  });
});

describe("voice assistant OpenAI-compatible provider loop", () => {
  it("sends tools, executes one, and returns the final response", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(toolCompletion())
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { role: "assistant", content: "你有一个待办。" } }] }));
    const callTool = vi.fn().mockResolvedValue({ items: [{ title: "买牛奶" }] });
    const result = await runVoiceAssistant({ ...baseInput, callTool, fetchImpl });
    expect(callTool).toHaveBeenCalledWith("list_todos", {});
    expect(result.reply).toBe("你有一个待办。");
    expect(result.toolCalls[0]).toMatchObject({ name: "list_todos", status: "success" });
    const firstRequest = fetchImpl.mock.calls[0][1];
    expect(fetchImpl.mock.calls[0][0]).toBe("https://provider.test/v1/chat/completions");
    expect(firstRequest.headers.authorization).toBe("Bearer provider-secret");
    const secondPayload = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(secondPayload.messages.some((message: { role: string; tool_call_id?: string }) => message.role === "tool" && message.tool_call_id === "call-0")).toBe(true);
  });

  it("streams and rejects a provider body immediately above 1MB", async () => {
    const chunk = new Uint8Array(MAX_PROVIDER_BYTES);
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(pulls === 1 ? chunk : new Uint8Array([1])); } });
    await expect(readProviderCompletion(new Response(body))).rejects.toThrow("AI 响应过大");
    expect(pulls).toBe(2);
  });

  it("rejects more than eight tool calls without executing or sending partial tool messages", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(toolCompletion(9));
    const callTool = vi.fn();
    await expect(runVoiceAssistant({ ...baseInput, fetchImpl, callTool })).rejects.toThrow("工具调用总数超过限制");
    expect(callTool).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("enforces eight tool calls cumulatively across provider rounds", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(toolCompletion(5)).mockResolvedValueOnce(toolCompletion(4));
    const callTool = vi.fn().mockResolvedValue({ ok: true });
    await expect(runVoiceAssistant({ ...baseInput, fetchImpl, callTool })).rejects.toThrow("工具调用总数超过限制");
    expect(callTool).toHaveBeenCalledTimes(5);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("awaits started tool work past deadline and never retries provider while it runs", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn().mockResolvedValue(toolCompletion());
      let finishTool!: (value: unknown) => void;
      const callTool = vi.fn(() => new Promise((resolve) => { finishTool = resolve; }));
      const pending = runVoiceAssistant({ ...baseInput, fetchImpl, callTool, timeoutMs: 100 });
      const assertion = expect(pending).rejects.toThrow("整体请求超时");
      await vi.advanceTimersByTimeAsync(150);
      expect(callTool).toHaveBeenCalledTimes(1);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      finishTool({ changed: true });
      await assertion;
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it("returns committed mutation traces as partial success instead of a retryable total failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(toolCompletion()).mockRejectedValueOnce(new Error("provider failed"));
    const callTool = vi.fn().mockResolvedValue({ created: true });
    const result = await runVoiceAssistant({ ...baseInput, fetchImpl, callTool, isMutationTool: () => true });
    expect(result.partial).toBe(true);
    expect(result.reply).toContain("避免重复提交");
    expect(result.toolCalls).toHaveLength(1);
    expect(callTool).toHaveBeenCalledTimes(1);
  });
});
