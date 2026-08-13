import { lookup } from "node:dns/promises";
import * as https from "node:https";
import type { OutgoingHttpHeaders } from "node:http";
import { isIP } from "node:net";
import { Readable } from "node:stream";

export type AssistantMessage = { role: "user" | "assistant"; content: string };
export type AssistantTool = { name: string; description?: string; inputSchema: Record<string, unknown> };
export type ToolTrace = { name: string; arguments: Record<string, unknown>; status: "success" | "error"; result: string };
export type HostResolver = (hostname: string) => Promise<string[]>;
export type ProviderTransport = (url: URL, init: RequestInit, addresses: readonly string[]) => Promise<Response>;

type ProviderMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
};

type Completion = {
  choices?: Array<{ message?: ProviderMessage }>;
  error?: { message?: string };
};

const MAX_TOOL_ROUNDS = 4;
export const MAX_TOOL_CALLS = 8;
export const MAX_PROVIDER_BYTES = 1_000_000;
const MAX_TOOL_RESULT_CHARS = 20_000;
const REQUEST_TIMEOUT_MS = 45_000;
export const ASSISTANT_TIMEOUT_MS = 55_000;

const defaultResolver: HostResolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);

function ipv4Number(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0]! * 256 + parts[1]!) * 256 + parts[2]!) * 256 + parts[3]!) >>> 0;
}

function inV4Range(value: number, base: number, bits: number) {
  const size = 2 ** (32 - bits);
  return Math.floor(value / size) === Math.floor(base / size);
}

/** Public-only address policy used to prevent provider requests reaching special-use networks. */
export function isPublicProviderAddress(address: string) {
  const version = isIP(address);
  if (version === 4) {
    const value = ipv4Number(address)!;
    const ranges: Array<[string, number]> = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
      ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
      ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ];
    return !ranges.some(([base, bits]) => inV4Range(value, ipv4Number(base)!, bits));
  }
  if (version !== 6) return false;
  const normalized = address.toLowerCase();
  const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) return isPublicProviderAddress(mapped);
  // Globally routable IPv6 is 2000::/3; exclude IETF special-purpose ranges within it.
  if (!/^[23][0-9a-f]{3}:/.test(normalized)) return false;
  const hextets = normalized.split(":");
  const second = Number.parseInt(hextets[1] || "0", 16);
  // 2001:0000::/23 is predominantly IETF special-purpose space; reject it conservatively.
  if (hextets[0] === "2001" && second <= 0x1ff) return false;
  if (normalized.startsWith("2001:db8:")) return false;
  // 3fff::/20 is reserved for documentation.
  if (hextets[0] === "3fff" && second <= 0x0fff) return false;
  return true;
}

/** Validates scheme/host and returns the exact public addresses that the connection must use. */
export async function validateProviderUrl(value: string | URL, resolver: HostResolver = defaultResolver) {
  let url: URL;
  try { url = value instanceof URL ? new URL(value) : new URL(value); } catch { throw new Error("AI Base URL 无效"); }
  if (url.protocol !== "https:") throw new Error("AI Base URL 必须使用 HTTPS");
  if (url.username || url.password) throw new Error("AI Base URL 不得包含凭据");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) throw new Error("AI Base URL 主机不安全");
  const addresses = isIP(hostname) ? [hostname] : await resolver(hostname);
  if (addresses.length === 0 || addresses.some((address) => !isPublicProviderAddress(address))) {
    throw new Error("AI Base URL 解析到不安全地址");
  }
  return { url, addresses };
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | Array<{ address: string; family: number }>, family?: number) => void;

/** A Node lookup function that never performs DNS and can only return the validated addresses. */
export function pinnedLookup(addresses: readonly string[]) {
  const records = addresses.map((address) => ({ address, family: isIP(address) }));
  return (_hostname: string, options: { all?: boolean; family?: number } | number, callback: LookupCallback) => {
    const family = typeof options === "number" ? options : options.family;
    const eligible = family === 4 || family === 6 ? records.filter((record) => record.family === family) : records;
    if (!eligible.length) {
      const error = Object.assign(new Error("No validated address for requested family"), { code: "ENOTFOUND" });
      callback(error, "", 0);
      return;
    }
    if (typeof options !== "number" && options.all) callback(null, eligible);
    else callback(null, eligible[0]!.address, eligible[0]!.family);
  };
}

/** Production transport: TLS retains hostname SNI/certificate checks while DNS is pinned. */
export const httpsProviderTransport: ProviderTransport = (url, init, addresses) => new Promise((resolve, reject) => {
  const request = https.request(url, {
    method: init.method,
    headers: init.headers as OutgoingHttpHeaders,
    lookup: pinnedLookup(addresses) as https.RequestOptions["lookup"],
    servername: url.hostname,
    rejectUnauthorized: true,
    signal: init.signal ?? undefined,
  }, (response) => {
    const status = response.statusCode || 500;
    if (status >= 300 && status < 400) {
      response.destroy();
      reject(new Error("AI 提供方重定向已拒绝"));
      return;
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(response.headers)) {
      if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
      else if (value !== undefined) headers.set(name, String(value));
    }
    resolve(new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, { status, headers }));
  });
  request.on("error", reject);
  if (init.body) request.write(init.body);
  request.end();
});

function endpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function safeMessage(value: unknown, fallback: string) {
  const message = value instanceof Error ? value.message : String(value || fallback);
  return message
    .replace(/(?:bearer|token|secret|password|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[REDACTED]")
    .slice(0, 500);
}

export async function readProviderCompletion(response: Response): Promise<Completion> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_PROVIDER_BYTES) throw new Error("AI 响应过大");
  if (!response.body) throw new Error("AI 返回了无效响应");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_PROVIDER_BYTES) {
        await reader.cancel();
        throw new Error("AI 响应过大");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  let parsed: Completion;
  try { parsed = JSON.parse(new TextDecoder().decode(combined)) as Completion; } catch { throw new Error("AI 返回了无效响应"); }
  if (!response.ok) throw new Error(safeMessage(parsed.error?.message, `AI 请求失败（HTTP ${response.status}）`));
  return parsed;
}

export async function runVoiceAssistant(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: AssistantMessage[];
  tools: AssistantTool[];
  callTool: (name: string, arguments_: Record<string, unknown>) => Promise<unknown>;
  isMutationTool?: (name: string) => boolean;
  fetchImpl?: typeof fetch;
  transport?: ProviderTransport;
  resolver?: HostResolver;
  timeoutMs?: number;
}) {
  // Injected fetch is retained for isolated tests; production always uses the pinned Node HTTPS transport.
  const transport: ProviderTransport = input.transport ?? (input.fetchImpl
    ? (url, init) => input.fetchImpl!(url.toString(), init)
    : httpsProviderTransport);
  const deadline = Date.now() + (input.timeoutMs ?? ASSISTANT_TIMEOUT_MS);
  const remaining = () => {
    const value = deadline - Date.now();
    if (value <= 0) throw new Error("AI 助手整体请求超时");
    return value;
  };
  const messages: ProviderMessage[] = [
    { role: "system", content: input.systemPrompt },
    ...input.messages.map((message) => ({ role: message.role, content: message.content })),
  ];
  const tools = input.tools.map((tool) => ({
    type: "function" as const,
    function: { name: tool.name, description: tool.description || "", parameters: tool.inputSchema },
  }));
  const traces: ToolTrace[] = [];
  let toolCallCount = 0;
  let committedMutation = false;

  try {
   for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const providerEndpoint = endpoint(input.baseUrl);
    remaining();
    const validated = await validateProviderUrl(providerEndpoint, input.resolver);
    remaining();
    const controller = new AbortController();
    const requestTimeout = Math.min(REQUEST_TIMEOUT_MS, remaining());
    const timer = setTimeout(() => controller.abort(), requestTimeout);
    let completion: Completion;
    try {
      completion = await transport(validated.url, {
          method: "POST",
          headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model: input.model, messages, tools, tool_choice: "auto" }),
          signal: controller.signal,
          redirect: "error",
        }, validated.addresses).then(readProviderCompletion);
    } catch (error) {
      if (controller.signal.aborted) {
        if (Date.now() >= deadline) throw new Error("AI 助手整体请求超时");
        throw new Error("AI 请求超时");
      }
      throw new Error(safeMessage(error, "AI 请求失败"));
    } finally { clearTimeout(timer); }

    remaining();
    const message = completion.choices?.[0]?.message;
    if (!message) throw new Error("AI 未返回有效消息");
    const calls = message.tool_calls || [];
    if (calls.length === 0) return { reply: String(message.content || ""), toolCalls: traces };
    if (toolCallCount + calls.length > MAX_TOOL_CALLS) throw new Error("AI 工具调用总数超过限制");
    if (round === MAX_TOOL_ROUNDS) throw new Error("AI 工具调用轮次超过限制");
    toolCallCount += calls.length;
    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });

    for (const call of calls) {
      let arguments_: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(call.function.arguments || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("工具参数必须是对象");
        arguments_ = parsed as Record<string, unknown>;
      } catch {
        const result = "工具参数不是有效 JSON";
        traces.push({ name: call.function.name, arguments: {}, status: "error", result });
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
        continue;
      }
      try {
        // Local MCP completion is authoritative: never abandon/race state-changing work.
        remaining();
        const value = await input.callTool(call.function.name, arguments_);
        if (input.isMutationTool?.(call.function.name)) committedMutation = true;
        remaining();
        const result = JSON.stringify(value).slice(0, MAX_TOOL_RESULT_CHARS);
        traces.push({ name: call.function.name, arguments: arguments_, status: "success", result });
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      } catch (error) {
        if (Date.now() >= deadline) throw new Error("AI 助手整体请求超时");
        const result = safeMessage(error, "工具调用失败");
        traces.push({ name: call.function.name, arguments: arguments_, status: "error", result });
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
    }
   }
   throw new Error("AI 工具调用未完成");
  } catch (error) {
    if (committedMutation) {
      const warning = `操作已执行，但后续 AI 回复失败：${safeMessage(error, "后续处理失败")}。请先检查工具调用结果，避免重复提交。`;
      return { reply: warning, toolCalls: traces, partial: true };
    }
    throw error;
  }
}
