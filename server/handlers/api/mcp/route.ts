import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { readApiKeyCredentials, requireAiApiKeySession } from "@/lib/auth";
import { createReminderMcpServer } from "@/lib/mcp/server";

const MAX_INTERNAL_RESPONSE_BYTES = 1_000_000;
const ALLOWED_API_CALLS = [
  ["GET", /^\/api\/reminders(?:\/[^/]+)?$/],
  ["POST", /^\/api\/reminders$/],
  ["PUT", /^\/api\/reminders\/[^/]+$/],
  ["DELETE", /^\/api\/reminders\/[^/]+$/],
  ["POST", /^\/api\/reminders\/[^/]+\/(?:complete|restore)$/],
  ["GET", /^\/api\/todos$/],
  ["POST", /^\/api\/todos$/],
  ["PATCH", /^\/api\/todos\/[^/]+$/],
  ["DELETE", /^\/api\/todos\/[^/]+$/],
  ["GET", /^\/api\/scheduler\/status$/],
] as const;

function isAllowedApiCall(method: string, path: string) {
  const pathname = new URL(path, "https://mcp.internal").pathname;
  return ALLOWED_API_CALLS.some(([allowedMethod, pattern]) => allowedMethod === method && pattern.test(pathname));
}

function safeBusinessError(value: string) {
  return value
    .replace(/(?:https?|file|libsql):\/\/\S+/gi, "[REDACTED_URL]")
    .replace(/(?:bearer|token|secret|password|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[REDACTED]")
    .slice(0, 500);
}

function forwardedHeaders(request: Request) {
  const credentials = readApiKeyCredentials(request);
  if (!credentials.key || credentials.conflict) return null;
  return new Headers({ authorization: `Bearer ${credentials.key}` });
}

async function readApiResponse(response: Response) {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_INTERNAL_RESPONSE_BYTES) throw new Error("业务接口响应过大");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_INTERNAL_RESPONSE_BYTES) {
    throw new Error("业务接口响应过大");
  }

  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 500) };
    }
  }
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? safeBusinessError(data.error)
      : `业务接口调用失败（HTTP ${response.status}）`;
    throw new Error(message);
  }
  return data;
}

async function handleMcp(request: Request) {
  const session = await requireAiApiKeySession(request);
  const headers = forwardedHeaders(request);
  if (!session || !headers) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const server = createReminderMcpServer({
    callApi: async ({ method, path, body }) => {
      if (!isAllowedApiCall(method, path)) throw new Error("MCP 工具请求超出允许范围");
      const { dispatchRequest } = await import("@/server/http/dispatcher");
      const internalHeaders = new Headers(headers);
      if (body !== undefined) internalHeaders.set("content-type", "application/json");
      const response = await dispatchRequest(new Request(new URL(path, request.url), {
        method,
        headers: internalHeaders,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }));
      if (!response) throw new Error("业务接口不存在");
      return readApiResponse(response);
    },
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const POST = handleMcp;
export const GET = handleMcp;
export const DELETE = handleMcp;

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      allow: "GET, POST, DELETE, OPTIONS",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      "access-control-allow-headers": "Authorization, X-API-Key, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID",
      "access-control-expose-headers": "MCP-Protocol-Version, MCP-Session-Id",
      vary: "Origin",
    },
  });
}
