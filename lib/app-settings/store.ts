import type { AppSetting, Prisma } from "@prisma/client";

import { eq, insertRow, selectOne, updateRows, upsertRow } from "@/lib/notification-center/store";

const TABLE = "app_settings";
const DATE_FIELDS = new Set(["otpConfiguredAt", "telegramBotLastTestAt", "createdAt", "updatedAt"]);
const snake = (value: string) => value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);

type Row = Record<string, unknown>;

function fromRow(row: Row): AppSetting {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    const camel = key.replace(/_([a-z])/g, (_, character: string) => character.toUpperCase());
    return [camel, DATE_FIELDS.has(camel) && typeof value === "string" ? new Date(value) : value];
  })) as AppSetting;
}

function toRow(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [snake(key), value instanceof Date ? value.toISOString() : value]));
}

const defaults: Prisma.AppSettingCreateInput = {
  id: 1,
  appName: "到期提醒",
  timezone: "Asia/Shanghai",
  defaultRemindBeforeDays: 3,
  defaultRemindBeforeHours: 24,
  overdueRepeatEnabled: true,
  dailyRemindTime: "09:00",
  emailNotificationsEnabled: false,
  reminderEmailEnabled: true,
  reminderEmailInterval: 1800,
  notifyStartHour: 9,
  notifyEndHour: 22,
  r2CacheControl: "public, max-age=86400",
  telegramBotEnabled: false,
};

function assertSingleton(id: number | undefined) {
  if (id !== 1) throw new Error("AppSetting only supports singleton id=1");
}

export const appSettingStore = {
  async findUnique(args: { where: { id: number } }): Promise<AppSetting | null> {
    assertSingleton(args.where.id);
    const row = await selectOne<Row>(TABLE, { filters: { id: eq(1) } });
    return row ? fromRow(row) : null;
  },

  async update(args: { where: { id: number }; data: Prisma.AppSettingUpdateInput }): Promise<AppSetting> {
    assertSingleton(args.where.id);
    const rows = await updateRows<Row>(TABLE, { id: eq(1) }, toRow({ ...args.data, updatedAt: new Date() } as Row));
    if (!rows[0]) throw new Error("app_settings row not found");
    return fromRow(rows[0]);
  },

  async upsert(args: { where: { id: number }; update: Prisma.AppSettingUpdateInput; create: Prisma.AppSettingCreateInput }): Promise<AppSetting> {
    assertSingleton(args.where.id);
    const existing = await this.findUnique({ where: { id: 1 } });
    if (existing) return Object.keys(args.update).length ? this.update({ where: { id: 1 }, data: args.update }) : existing;
    const now = new Date();
    const row = await upsertRow<Row>(TABLE, toRow({ ...defaults, ...args.create, id: 1, createdAt: now, updatedAt: now } as Row));
    return fromRow(row);
  },

  async create(args: { data: Prisma.AppSettingCreateInput }): Promise<AppSetting> {
    assertSingleton(args.data.id ?? 1);
    const now = new Date();
    return fromRow(await insertRow<Row>(TABLE, toRow({ ...defaults, ...args.data, id: 1, createdAt: now, updatedAt: now } as Row)));
  },
};
