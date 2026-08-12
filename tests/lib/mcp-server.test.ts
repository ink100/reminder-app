import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";

import { createReminderMcpServer } from "@/lib/mcp/server";

async function connectedClient(callApi: (input: { method: string; path: string; body?: unknown }) => Promise<unknown>) {
  const server = createReminderMcpServer({ callApi });
  const client = new Client({ name: "mcp-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

describe("Reminder App MCP server", () => {
  it("exposes only the fixed reminder, todo, and scheduler tool allowlist", async () => {
    const { client, server } = await connectedClient(vi.fn());
    const tools = await client.listTools();

    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "complete_reminder",
      "create_reminder",
      "create_todo",
      "delete_reminder",
      "delete_todo",
      "get_reminder",
      "get_scheduler_status",
      "list_reminders",
      "list_todos",
      "restore_reminder",
      "update_reminder",
      "update_todo",
    ]);
    expect(tools.tools.some((tool) => /auth|invite|api.?key|settings/i.test(tool.name))).toBe(false);
    await client.close();
    await server.close();
  });

  it("maps a tool call to its fixed API method and encoded resource path", async () => {
    const callApi = vi.fn().mockResolvedValue({ item: { id: "todo/id", completedAt: null } });
    const { client, server } = await connectedClient(callApi);

    const result = await client.callTool({
      name: "update_todo",
      arguments: { id: "todo/id", title: "更新后的待办", completed: true },
    });

    expect(callApi).toHaveBeenCalledWith({
      method: "PATCH",
      path: "/api/todos/todo%2Fid",
      body: { title: "更新后的待办", completed: true },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({ item: { id: "todo/id", completedAt: null } });
    await client.close();
    await server.close();
  });

  it("returns business API failures as MCP tool errors without exposing arbitrary internals", async () => {
    const { client, server } = await connectedClient(vi.fn().mockRejectedValue(new Error("Not found")));

    const result = await client.callTool({ name: "get_reminder", arguments: { id: "missing" } });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: "text", text: "Not found" }]);
    await client.close();
    await server.close();
  });
});
