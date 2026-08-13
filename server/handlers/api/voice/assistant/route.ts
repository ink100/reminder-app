import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";

import { requireBrowserSession } from "@/lib/auth";
import { createReminderMcpServer } from "@/lib/mcp/server";
import { runVoiceAssistant, type ProviderTransport } from "@/lib/voice/assistant";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_INTERNAL_RESPONSE_BYTES = 1_000_000;
const BLOCKED_TOOLS = new Set(["delete_reminder", "delete_todo"]);
const MUTATING_TOOLS = new Set([
  "create_reminder", "update_reminder", "complete_reminder", "restore_reminder",
  "create_todo", "update_todo",
]);
const ALLOWED_API_CALLS = [
  ["GET", /^\/api\/reminders(?:\/[^/]+)?$/],
  ["POST", /^\/api\/reminders$/],
  ["PUT", /^\/api\/reminders\/[^/]+$/],
  ["POST", /^\/api\/reminders\/[^/]+\/(?:complete|restore)$/],
  ["GET", /^\/api\/todos$/],
  ["POST", /^\/api\/todos$/],
  ["PATCH", /^\/api\/todos\/[^/]+$/],
  ["GET", /^\/api\/scheduler\/status$/],
] as const;

const requestSchema = z.object({
  baseUrl: z.string().trim().max(500).optional().default(""),
  apiKey: z.string().trim().min(1).max(1000),
  model: z.string().trim().max(200).optional().default(""),
  systemPrompt: z.string().max(8000).optional().default("你是提醒事项语音助手。需要时使用工具，并简洁地用中文回复。"),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) })).min(1).max(30),
  allowMutations: z.boolean().optional().default(false),
});

function isAllowedApiCall(method: string, path: string) {
  const pathname = new URL(path, "https://voice-assistant.internal").pathname;
  return ALLOWED_API_CALLS.some(([allowedMethod, pattern]) => allowedMethod === method && pattern.test(pathname));
}

function safeError(value: unknown) {
  const message = value instanceof Error ? value.message : "AI 语音助手请求失败";
  return message
    .replace(/(?:https?|file|libsql):\/\/\S+/gi, "[REDACTED_URL]")
    .replace(/(?:bearer|token|secret|password|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[REDACTED]")
    .slice(0, 500);
}

async function readLimitedBody(body: ReadableStream<Uint8Array> | null, limit: number, tooLarge: string) {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new Error(tooLarge); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(combined);
}

async function readInternalResponse(response: Response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_INTERNAL_RESPONSE_BYTES) throw new Error("业务接口响应过大");
  const text = await readLimitedBody(response.body, MAX_INTERNAL_RESPONSE_BYTES, "业务接口响应过大");
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text.slice(0, 500) }; }
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error : `业务接口调用失败（HTTP ${response.status}）`;
    throw new Error(safeError(message));
  }
  return data;
}

export async function POST(request: Request, dependencies: { providerTransport?: ProviderTransport } = {}) {
  // Deliberately omit request: this route accepts only the current browser Cookie session,
  // never ai:all credentials or the user-supplied provider key.
  const session = await requireBrowserSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_REQUEST_BYTES) return Response.json({ error: "请求过大" }, { status: 413 });

  let raw: string;
  try { raw = await readLimitedBody(request.body, MAX_REQUEST_BYTES, "请求过大"); }
  catch (error) { return Response.json({ error: error instanceof Error && error.message === "请求过大" ? "请求过大" : "无法读取请求" }, { status: error instanceof Error && error.message === "请求过大" ? 413 : 400 }); }
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return Response.json({ error: "请求格式无效" }, { status: 400 }); }
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "AI 助手参数无效" }, { status: 400 });

  const baseUrl = parsed.data.baseUrl || process.env.VOICE_ASSISTANT_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = parsed.data.model || process.env.VOICE_ASSISTANT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  let providerUrl: URL;
  try { providerUrl = new URL(baseUrl); } catch { return Response.json({ error: "AI Base URL 无效" }, { status: 400 }); }
  if (providerUrl.protocol !== "https:") return Response.json({ error: "AI Base URL 必须使用 HTTPS" }, { status: 400 });

  const cookie = request.headers.get("cookie") || "";
  const server = createReminderMcpServer({
    callApi: async ({ method, path, body }) => {
      if (!isAllowedApiCall(method, path)) throw new Error("语音助手工具请求超出允许范围");
      const { dispatchRequest } = await import("@/server/http/dispatcher");
      const headers = new Headers();
      if (cookie) headers.set("cookie", cookie);
      if (body !== undefined) headers.set("content-type", "application/json");
      const response = await dispatchRequest(new Request(new URL(path, request.url), {
        method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }));
      if (!response) throw new Error("业务接口不存在");
      return readInternalResponse(response);
    },
  });
  const client = new Client({ name: "voice-assistant", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const listed = await client.listTools();
    const tools = listed.tools.filter((tool) => !BLOCKED_TOOLS.has(tool.name) && (parsed.data.allowMutations || !MUTATING_TOOLS.has(tool.name))).map((tool) => ({
      name: tool.name, description: tool.description, inputSchema: tool.inputSchema as Record<string, unknown>,
    }));
    const result = await runVoiceAssistant({
      baseUrl: providerUrl.toString(), apiKey: parsed.data.apiKey, model,
      systemPrompt: parsed.data.systemPrompt, messages: parsed.data.messages, tools,
      callTool: async (name, arguments_) => {
        if (BLOCKED_TOOLS.has(name) || (!parsed.data.allowMutations && MUTATING_TOOLS.has(name)) || !tools.some((tool) => tool.name === name)) throw new Error("工具未获授权");
        const result = await client.callTool({ name, arguments: arguments_ });
        if (result.isError) throw new Error(typeof result.content === "string" ? result.content : JSON.stringify(result.content).slice(0, 500));
        return result.structuredContent ?? result.content;
      },
      isMutationTool: (name) => MUTATING_TOOLS.has(name),
      transport: dependencies.providerTransport,
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: safeError(error) }, { status: 502 });
  } finally {
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}
