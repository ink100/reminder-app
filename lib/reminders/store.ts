import { randomBytes } from "node:crypto";

import type { Attachment, Image, LicenseStoreAccount, Reminder, TaskRunLog, Todo } from "@prisma/client";
import { countRows, eq, insertRow, selectOne, selectRows, updateRows } from "@/lib/notification-center/store";

type Scalar = string | number | boolean | null | Date;
type Row = Record<string, unknown>;
type Predicate = Scalar | { not?: null | { startsWith: string }; contains?: string; startsWith?: string; lte?: Scalar };
type Where = Record<string, unknown>;
type Select = Record<string, boolean>;
type Include = { reminder?: boolean | { select?: Select } };
type Args = { where?: Where; orderBy?: Record<string, "asc" | "desc"> | Record<string, "asc" | "desc">[]; take?: number; skip?: number; select?: Select; include?: Include; data?: Row };
type RelatedReminder<T> = T & { reminder?: Reminder | null };
type BusinessAttachment = Attachment & { attachmentType: string | null };

type Store<T> = {
  findMany(args?: Args): Promise<T[]>;
  findFirst(args?: Args): Promise<T | null>;
  findUnique(args: Args): Promise<T | null>;
  count(args?: Args): Promise<number>;
  create(args: Args): Promise<T>;
  update(args: Args): Promise<T>;
  updateMany(args: Args): Promise<{ count: number }>;
};

const dateFields = new Set(["dueAt", "upcomingNotifiedAt", "overdueNotifiedAt", "completedAt", "createdAt", "updatedAt", "deletedAt", "expiresAt", "startedAt", "finishedAt"]);
const snake = (value: string) => value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);

export function mapRow<T = Row>(row: Row): T {
  const output: Row = {};
  for (const [key, value] of Object.entries(row)) {
    const camel = key.replace(/_([a-z])/g, (_, character: string) => character.toUpperCase());
    output[camel] = dateFields.has(camel) && typeof value === "string" ? new Date(value) : value;
  }
  return output as T;
}

function toRow(data: Row) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [snake(key), value instanceof Date ? value.toISOString() : value]));
}

function escapeLikeLiteral(value: string) {
  return value.replace(/[\\%_*,()\"]/g, (character) => `\\${character}`);
}

function likePattern(value: string, mode: "contains" | "startsWith") {
  const literal = escapeLikeLiteral(value);
  return `"${mode === "contains" ? "*" : ""}${literal}*"`;
}

let cuidCounter = 0;
/** CUID v1-compatible IDs, matching Prisma's former `@default(cuid())` shape. */
export function createCuid(now = Date.now()): string {
  const timestamp = now.toString(36);
  const counter = (cuidCounter++ % 1_679_616).toString(36).padStart(4, "0");
  const fingerprint = ((process.pid + 36).toString(36) + "node").slice(-4).padStart(4, "0");
  const random = randomBytes(6).toString("base64url").toLowerCase().replaceAll("-", "a").replaceAll("_", "b").slice(0, 8);
  return `c${timestamp}${counter}${fingerprint}${random}`;
}

function compilePredicate(field: string, value: Predicate): string {
  if (value === null) return "is.null";
  if (value instanceof Date || ["string", "number", "boolean"].includes(typeof value)) return eq(value as Exclude<Scalar, null>);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Unsupported predicate for ${field}`);
  const keys = Object.keys(value);
  if (keys.length !== 1) throw new Error(`Unsupported predicate for ${field}: expected exactly one operator`);
  if ("not" in value && value.not === null) return "not.is.null";
  if ("not" in value && value.not && typeof value.not === "object" && Object.keys(value.not).length === 1 && "startsWith" in value.not)
    return `not.like.${likePattern(String(value.not.startsWith), "startsWith")}`;
  if ("contains" in value && typeof value.contains === "string") return `ilike.${likePattern(value.contains, "contains")}`;
  if ("startsWith" in value && typeof value.startsWith === "string") return `like.${likePattern(value.startsWith, "startsWith")}`;
  if ("lte" in value && (value.lte === null || value.lte instanceof Date || ["string", "number", "boolean"].includes(typeof value.lte)))
    return `lte.${value.lte instanceof Date ? value.lte.toISOString() : String(value.lte)}`;
  throw new Error(`Unsupported predicate for ${field}: ${keys.join(",")}`);
}

function compileWhere(where: Where = {}) {
  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(where)) {
    if (key === "OR") continue;
    filters[snake(key)] = compilePredicate(key, value as Predicate);
  }
  const rawOr = where.OR;
  let or: string | undefined;
  if (rawOr !== undefined) {
    if (!Array.isArray(rawOr) || rawOr.length === 0) throw new Error("OR must be a non-empty array");
    const clauses = rawOr.map((clause) => {
      const entries = Object.entries(clause);
      if (entries.length !== 1) throw new Error("Each OR clause must contain exactly one predicate");
      const [key, value] = entries[0];
      return `${snake(key)}.${compilePredicate(key, value as Predicate)}`;
    }).join(",");
    or = `(${clauses})`;
  }
  return { filters, or };
}

function compileOrder(orderBy: Args["orderBy"]) {
  if (!orderBy) return undefined;
  return (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((entry) => Object.entries(entry).map(([key, direction]) => {
    if (direction !== "asc" && direction !== "desc") throw new Error(`Unsupported order direction for ${key}`);
    return `${snake(key)}.${direction}`;
  })).join(",");
}

function validateSelect(select?: Select) {
  if (!select) return;
  if (Object.values(select).some((selected) => typeof selected !== "boolean")) throw new Error("Select values must be boolean");
}
function project<T extends Row>(item: T, select?: Select): T {
  if (!select) return item;
  validateSelect(select);
  return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, item[key]])) as T;
}
function selectColumns(select?: Select) {
  if (!select) return undefined;
  validateSelect(select);
  const fields = Object.keys(select).filter((key) => select[key]);
  if (!fields.length) throw new Error("Select must contain at least one true field");
  return fields.map(snake).join(",");
}

async function addRelations(table: string, items: Row[], include?: Include) {
  if (!include) return items;
  if (!["attachments", "license_store_accounts"].includes(table)) throw new Error(`Includes are not supported for ${table}`);
  const includeKeys = Object.keys(include);
  if (includeKeys.some((key) => key !== "reminder")) throw new Error(`Unsupported include: ${includeKeys.join(",")}`);
  if (!include.reminder) return items;
  const relationSelect = typeof include.reminder === "object" ? include.reminder.select : undefined;
  const ids = [...new Set(items.map((item) => item.reminderId).filter((id): id is string => typeof id === "string"))];
  if (!ids.length) return items.map((item) => ({ ...item, reminder: null }));
  const rows = await selectRows<Row>("reminders", { select: selectColumns(relationSelect), filters: { id: `in.(${ids.map((id) => `"${id.replaceAll('"', '\\"')}"`).join(",")})` } });
  const byId = new Map(rows.map((row) => { const mapped = mapRow<Row>(row); return [mapped.id, project(mapped, relationSelect)]; }));
  return items.map((item) => ({ ...item, reminder: byId.get(item.reminderId) ?? null }));
}

function model<T>(table: string, timestamps = true): Store<T> {
  const store: Store<T> = {
    async findMany(args = {}) {
      if (args.select && args.include) throw new Error("Select and include cannot be used together");
      const { filters, or } = compileWhere(args.where);
      const rows = await selectRows<Row>(table, { select: selectColumns(args.select), filters, or, order: compileOrder(args.orderBy), limit: args.take, offset: args.skip });
      const items = rows.map((row) => project(mapRow<Row>(row), args.select));
      return await addRelations(table, items, args.include) as T[];
    },
    async findFirst(args = {}) { return (await store.findMany({ ...args, take: 1 }))[0] ?? null; },
    async findUnique(args) {
      if (args.include) return store.findFirst(args);
      const { filters, or } = compileWhere(args.where);
      if (or) throw new Error("OR is not supported by findUnique");
      const row = await selectOne<Row>(table, { select: selectColumns(args.select), filters });
      return row ? project(mapRow<Row>(row), args.select) as T : null;
    },
    async count(args = {}) { const { filters, or } = compileWhere(args.where); return countRows(table, { filters, or }); },
    async create(args) {
      if (!args.data) throw new Error("create requires data");
      const now = new Date();
      const data = { id: createCuid(), ...args.data, createdAt: now, ...(timestamps ? { updatedAt: now } : {}) };
      const item = mapRow<Row>(await insertRow<Row>(table, toRow(data)));
      return (await addRelations(table, [project(item, args.select)], args.include))[0] as T;
    },
    async update(args) {
      if (!args.data) throw new Error("update requires data");
      const { filters, or } = compileWhere(args.where);
      if (or) throw new Error("OR is not supported by update");
      const patch = { ...args.data, ...(timestamps ? { updatedAt: new Date() } : {}) };
      const rows = await updateRows<Row>(table, filters, toRow(patch));
      if (!rows[0]) throw new Error(`${table} row not found`);
      const item = project(mapRow<Row>(rows[0]), args.select);
      return (await addRelations(table, [item], args.include))[0] as T;
    },
    async updateMany(args) {
      if (!args.data) throw new Error("updateMany requires data");
      const { filters, or } = compileWhere(args.where);
      if (or) throw new Error("OR is not supported by updateMany");
      return { count: (await updateRows<Row>(table, filters, toRow(args.data))).length };
    },
  };
  return store;
}

export const reminderStore = model<Reminder>("reminders");
export const attachmentStore = model<RelatedReminder<BusinessAttachment>>("attachments", false);
export const licenseStoreAccountStore = model<RelatedReminder<LicenseStoreAccount>>("license_store_accounts");
export const todoStore = model<Todo>("todos");
export const imageStore = model<Image>("images", false);
export const taskRunLogStore = model<TaskRunLog>("task_run_logs", false);
export const supabaseModels = { reminder: reminderStore, attachment: attachmentStore, licenseStoreAccount: licenseStoreAccountStore, todo: todoStore, image: imageStore, taskRunLog: taskRunLogStore };
