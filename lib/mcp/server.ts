import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export type McpApiCall = (input: {
  method: string;
  path: string;
  body?: unknown;
}) => Promise<unknown>;

type ServerDependencies = { callApi: McpApiCall };

const idSchema = z.object({ id: z.string().min(1).max(200) });
const todoCreateSchema = z.object({ title: z.string().min(1).max(200) });
const todoUpdateSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(200).optional(),
  completed: z.boolean().optional(),
}).refine(({ title, completed }) => title !== undefined || completed !== undefined, {
  message: "title 和 completed 至少提供一项",
});
const reminderInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  activationCode: z.string().nullable().optional(),
  activationContact: z.string().max(200).nullable().optional(),
  dueAt: z.string().datetime(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  category: z.string().nullable().optional(),
  remindBeforeDays: z.number().int().min(0).max(30).default(3),
  remindBeforeHours: z.number().int().min(0).max(168).default(0),
  overdueRemindEnabled: z.boolean().default(true),
  recurrenceType: z.enum(["daily", "weekly", "monthly", "yearly"]).nullable().optional(),
  recurrenceInterval: z.number().int().min(1).max(30).nullable().optional(),
});
const reminderUpdateSchema = reminderInputSchema.extend({ id: z.string().min(1).max(200) });

function toolResult(data: unknown): CallToolResult {
  const structuredContent = data && typeof data === "object"
    ? data as Record<string, unknown>
    : { result: data };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent,
  };
}

function toolError(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : "MCP 工具调用失败";
  return {
    isError: true,
    content: [{ type: "text" as const, text: message.slice(0, 500) }],
  };
}

function registerTool<T extends z.ZodRawShape>(
  server: McpServer,
  dependencies: ServerDependencies,
  name: string,
  description: string,
  inputSchema: T,
  call: (input: z.infer<z.ZodObject<T>>) => Parameters<McpApiCall>[0],
) {
  const callback = async (input: z.infer<z.ZodObject<T>>): Promise<CallToolResult> => {
    try {
      return toolResult(await dependencies.callApi(call(input)));
    } catch (error) {
      return toolError(error);
    }
  };
  server.registerTool(name, { description, inputSchema }, callback as never);
}

export function createReminderMcpServer(dependencies: ServerDependencies) {
  const server = new McpServer({ name: "reminder-app", version: "1.0.0" });

  registerTool(server, dependencies, "list_reminders", "列出所有未删除提醒", {}, () => ({ method: "GET", path: "/api/reminders" }));
  registerTool(server, dependencies, "get_reminder", "按 ID 读取提醒", idSchema.shape, ({ id }) => ({ method: "GET", path: `/api/reminders/${encodeURIComponent(id)}` }));
  registerTool(server, dependencies, "create_reminder", "创建提醒", reminderInputSchema.shape, (body) => ({ method: "POST", path: "/api/reminders", body }));
  registerTool(server, dependencies, "update_reminder", "完整更新提醒", reminderUpdateSchema.shape, ({ id, ...body }) => ({ method: "PUT", path: `/api/reminders/${encodeURIComponent(id)}`, body }));
  registerTool(server, dependencies, "complete_reminder", "完成提醒；周期提醒会顺延", idSchema.shape, ({ id }) => ({ method: "POST", path: `/api/reminders/${encodeURIComponent(id)}/complete` }));
  registerTool(server, dependencies, "restore_reminder", "恢复已完成的一次性提醒", idSchema.shape, ({ id }) => ({ method: "POST", path: `/api/reminders/${encodeURIComponent(id)}/restore` }));
  registerTool(server, dependencies, "delete_reminder", "软删除提醒及其附件元数据（破坏性操作）", idSchema.shape, ({ id }) => ({ method: "DELETE", path: `/api/reminders/${encodeURIComponent(id)}` }));

  registerTool(server, dependencies, "list_todos", "列出未删除待办", {}, () => ({ method: "GET", path: "/api/todos" }));
  registerTool(server, dependencies, "create_todo", "创建待办", todoCreateSchema.shape, (body) => ({ method: "POST", path: "/api/todos", body }));
  registerTool(server, dependencies, "update_todo", "更新待办标题或完成状态", todoUpdateSchema.shape, ({ id, ...body }) => ({ method: "PATCH", path: `/api/todos/${encodeURIComponent(id)}`, body }));
  registerTool(server, dependencies, "delete_todo", "软删除待办（破坏性操作）", idSchema.shape, ({ id }) => ({ method: "DELETE", path: `/api/todos/${encodeURIComponent(id)}` }));

  registerTool(server, dependencies, "get_scheduler_status", "读取提醒应用调度器状态", {}, () => ({ method: "GET", path: "/api/scheduler/status" }));

  return server;
}
