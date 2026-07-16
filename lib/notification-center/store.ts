import { randomUUID } from "node:crypto";

import { env } from "@/lib/env";
import { parseJsonObject, stringifyJson } from "@/lib/notification-center/types";

export type JsonObject = Record<string, unknown>;

type SupabaseConfig = { url: string; key: string };
type QueryValue = string | number | boolean | null | Date;

const REQUEST_TIMEOUT_MS = 10_000;

function getSupabaseConfig(): SupabaseConfig {
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("通知模块已切换为 Supabase：缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  return { url, key };
}

function headers(prefer?: string) {
  const config = getSupabaseConfig();
  return {
    apikey: config.key,
    authorization: `Bearer ${config.key}`,
    "content-type": "application/json",
    ...(prefer ? { prefer } : {}),
  };
}

function endpoint(table: string, params?: URLSearchParams) {
  const config = getSupabaseConfig();
  const qs = params?.toString();
  return `${config.url}/rest/v1/${table}${qs ? `?${qs}` : ""}`;
}

function encodeValue(value: QueryValue) {
  if (value instanceof Date) return value.toISOString();
  if (value === null) return "null";
  return String(value);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export async function selectRows<T>(table: string, options: {
  select?: string;
  filters?: Record<string, string>;
  order?: string;
  limit?: number;
  offset?: number;
  or?: string;
} = {}) {
  const params = new URLSearchParams();
  params.set("select", options.select ?? "*");
  for (const [key, value] of Object.entries(options.filters ?? {})) params.set(key, value);
  if (options.or) params.set("or", options.or);
  if (options.order) params.set("order", options.order);
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.offset !== undefined) params.set("offset", String(options.offset));

  const response = await fetch(endpoint(table, params), {
    headers: headers(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return parseResponse<T[]>(response);
}

export async function selectOne<T>(table: string, options: Parameters<typeof selectRows<T>>[1] = {}) {
  const rows = await selectRows<T>(table, { ...options, limit: 1 });
  return rows[0] ?? null;
}

export async function countRows(table: string, options: { filters?: Record<string, string>; or?: string } = {}) {
  const params = new URLSearchParams();
  params.set("select", "id");
  for (const [key, value] of Object.entries(options.filters ?? {})) params.set(key, value);
  if (options.or) params.set("or", options.or);
  const response = await fetch(endpoint(table, params), {
    headers: headers("count=exact"),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  await parseResponse<unknown[]>(response);
  const range = response.headers.get("content-range") ?? "0-0/0";
  return Number(range.split("/").at(-1) ?? 0);
}

export async function insertRow<T>(table: string, row: Record<string, unknown>) {
  const response = await fetch(endpoint(table), {
    method: "POST",
    headers: headers("return=representation"),
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const rows = await parseResponse<T[]>(response);
  if (!rows[0]) throw new Error(`Supabase insert ${table} returned no row`);
  return rows[0];
}

export async function upsertRow<T>(table: string, row: Record<string, unknown>, conflict = "id") {
  const params = new URLSearchParams({ on_conflict: conflict });
  const response = await fetch(endpoint(table, params), {
    method: "POST",
    headers: headers("resolution=merge-duplicates,return=representation"),
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const rows = await parseResponse<T[]>(response);
  if (!rows[0]) throw new Error(`Supabase upsert ${table} returned no row`);
  return rows[0];
}

export async function updateRows<T>(table: string, filters: Record<string, string>, patch: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) params.set(key, value);
  const response = await fetch(endpoint(table, params), {
    method: "PATCH",
    headers: headers("return=representation"),
    body: JSON.stringify(patch),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return parseResponse<T[]>(response);
}

export async function deleteRows(table: string, filters: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) params.set(key, value);
  const response = await fetch(endpoint(table, params), {
    method: "DELETE",
    headers: headers("return=minimal"),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  await parseResponse<null>(response);
}

export async function callRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(endpoint(`rpc/${name}`), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  return parseResponse<T>(response);
}

export function eq(value: QueryValue) {
  return `eq.${encodeValue(value)}`;
}

export function lte(value: QueryValue) {
  return `lte.${encodeValue(value)}`;
}

export function lt(value: QueryValue) {
  return `lt.${encodeValue(value)}`;
}

export function inList(values: string[]) {
  if (values.length === 0) return "in.()";
  return `in.(${values.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(",")})`;
}

export function ilikeContains(value: string) {
  return `ilike.*${value.replaceAll("*", "")}*`;
}

export function newId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

export type NotificationEventRow = {
  id: string;
  source: string;
  event_type: string;
  payload: JsonObject;
  created_at: string;
};

export type NotificationGroupRow = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
};

export type NotificationRow = {
  id: string;
  event_id: string | null;
  group_id: string;
  title: string;
  summary: string | null;
  priority: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export type NotificationChannelRow = {
  id: string;
  type: string;
  name: string;
  config: JsonObject;
  enabled: boolean;
  is_default: boolean;
  created_at: string;
};

export type NotificationTemplateRow = {
  id: string;
  name: string;
  channel_type: string;
  content: string;
  enabled: boolean;
  group_id: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type NotificationGroupRouteRow = {
  group_id: string;
  channel_id: string;
  mode: "custom" | "disabled";
  config_override: JsonObject;
  template_id: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationApiKeyRow = {
  id: string;
  name: string;
  api_key: string;
  enabled: boolean;
  expires_at: string | null;
};

export type QueueJobRow = {
  id: string;
  notification_id: string;
  channel_id: string;
  template_id: string;
  channel_config: JsonObject | null;
  rendered_content: string | null;
  priority: number;
  retry_count: number;
  max_retry: number;
  status: string;
  next_execute_at: string;
  locked_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type SendLogRow = {
  id: string;
  queue_job_id: string;
  request: JsonObject;
  response: JsonObject;
  result: string;
  duration_ms: number;
  created_at: string;
};

export type PushLedgerRow = {
  id: string;
  notification_id: string | null;
  queue_job_id: string | null;
  channel_id: string | null;
  channel_type: string;
  channel_name: string;
  target: string | null;
  title: string;
  content: string;
  raw_payload: JsonObject;
  business_type: string | null;
  business_id: string | null;
  status: string;
  retry_count: number;
  attempt_count: number;
  request: JsonObject | null;
  response: JsonObject | null;
  error: string | null;
  duration_ms: number | null;
  queued_at: string;
  started_at: string | null;
  sent_at: string | null;
  failed_at: string | null;
  last_retry_at: string | null;
  created_at: string;
  updated_at: string;
};

export function channelConfigString(row: NotificationChannelRow) {
  return stringifyJson(row.config ?? {});
}

export function parsePayload(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonObject;
  if (typeof value === "string") return parseJsonObject(value);
  return {};
}
