export const MEDICINE_CATEGORIES = [
  "感冒发烧",
  "肠胃消化",
  "皮肤外用",
  "过敏鼻炎",
  "外伤护理",
  "儿童用药",
  "慢病常备",
  "营养保健",
  "其他",
] as const;

export const MEDICINE_UNITS = ["片", "粒", "袋", "支", "瓶", "盒", "ml", "g", "次", "其他"] as const;

export const MEDICINE_ATTACHMENT_TYPES = {
  photo: "medicine_photo",
  location: "medicine_location_photo",
  content: "medicine_content_photo",
} as const;

export type MedicineCategory = (typeof MEDICINE_CATEGORIES)[number];
export type MedicineUnit = (typeof MEDICINE_UNITS)[number];
export type MedicineAttachmentType = (typeof MEDICINE_ATTACHMENT_TYPES)[keyof typeof MEDICINE_ATTACHMENT_TYPES];
export type MedicineStatus = "normal" | "expiring_soon" | "expired" | "low_stock" | "empty";

const attachmentLabels: Record<MedicineAttachmentType, string> = {
  medicine_photo: "药品照片",
  medicine_location_photo: "存放位置照片",
  medicine_content_photo: "药品内容照片",
};

export function isMedicineAttachmentType(value: string | null | undefined): value is MedicineAttachmentType {
  return Object.values(MEDICINE_ATTACHMENT_TYPES).includes(value as MedicineAttachmentType);
}

export function getMedicineAttachmentLabel(value: string | null | undefined) {
  return isMedicineAttachmentType(value) ? attachmentLabels[value] : null;
}

export type MedicineRecord = {
  id: string;
  name: string;
  category: string;
  tags: string | null;
  quantityTotal: number | null;
  quantityRemaining: number | null;
  unit: string;
  lowStockThreshold: number | null;
  locationText: string | null;
  contentText: string | null;
  openedAt: Date | null;
  expiresAt: Date | null;
  expirationReminderDays: number;
  expirationReminderId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type MedicineInput = {
  name: string;
  category: string;
  tags?: string | null;
  quantityTotal?: number | null;
  quantityRemaining?: number | null;
  unit: string;
  lowStockThreshold?: number | null;
  locationText?: string | null;
  contentText?: string | null;
  openedAt?: string | null;
  expiresAt?: string | null;
  expirationReminderDays?: number | null;
  notes?: string | null;
};

function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function normalizeDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return "invalid";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : value;
}

export function parseMedicineInput(raw: Record<string, unknown>): MedicineInput {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) throw new Error("请输入药品名称");
  if (name.length > 80) throw new Error("药品名称不能超过 80 个字符");

  const category = typeof raw.category === "string" && raw.category.trim() ? raw.category.trim() : "其他";
  if (!MEDICINE_CATEGORIES.includes(category as MedicineCategory)) throw new Error("请选择有效的药品分类");

  const unit = typeof raw.unit === "string" && raw.unit.trim() ? raw.unit.trim() : "盒";
  if (!MEDICINE_UNITS.includes(unit as MedicineUnit)) throw new Error("请选择有效的单位");

  const quantityTotal = normalizeNumber(raw.quantityTotal);
  const quantityRemaining = normalizeNumber(raw.quantityRemaining);
  const lowStockThreshold = normalizeNumber(raw.lowStockThreshold);
  if (Number.isNaN(quantityTotal) || Number.isNaN(quantityRemaining) || Number.isNaN(lowStockThreshold)) throw new Error("数量必须是数字");
  if ((quantityTotal ?? 0) < 0 || (quantityRemaining ?? 0) < 0 || (lowStockThreshold ?? 0) < 0) throw new Error("数量不能为负数");

  const openedAt = normalizeDate(raw.openedAt);
  const expiresAt = normalizeDate(raw.expiresAt);
  if (openedAt === "invalid" || expiresAt === "invalid") throw new Error("日期格式不正确");

  const expirationReminderDays = normalizeNumber(raw.expirationReminderDays) ?? 30;
  if (!Number.isInteger(expirationReminderDays) || expirationReminderDays < 0 || expirationReminderDays > 3650) throw new Error("过期提醒天数必须在 0 到 3650 之间");

  return {
    name,
    category,
    tags: typeof raw.tags === "string" && raw.tags.trim() ? raw.tags.trim() : null,
    quantityTotal,
    quantityRemaining,
    unit,
    lowStockThreshold,
    locationText: typeof raw.locationText === "string" && raw.locationText.trim() ? raw.locationText.trim() : null,
    contentText: typeof raw.contentText === "string" && raw.contentText.trim() ? raw.contentText.trim() : null,
    openedAt,
    expiresAt,
    expirationReminderDays,
    notes: typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.trim() : null,
  };
}

export function getMedicineStatus(medicine: Pick<MedicineRecord, "quantityRemaining" | "lowStockThreshold" | "expiresAt">, now = new Date()): MedicineStatus {
  if (medicine.expiresAt && medicine.expiresAt.getTime() < startOfDay(now).getTime()) return "expired";
  if (medicine.quantityRemaining !== null && medicine.quantityRemaining <= 0) return "empty";
  if (medicine.expiresAt) {
    const days = daysUntil(medicine.expiresAt, now);
    if (days <= 30) return "expiring_soon";
  }
  if (medicine.lowStockThreshold !== null && medicine.quantityRemaining !== null && medicine.quantityRemaining <= medicine.lowStockThreshold) return "low_stock";
  return "normal";
}

export function getMedicineStatusLabel(status: MedicineStatus) {
  return {
    normal: "正常",
    expiring_soon: "即将过期",
    expired: "已过期",
    low_stock: "库存偏低",
    empty: "已用完",
  }[status];
}

export function daysUntil(date: Date, now = new Date()) {
  return Math.ceil((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function validateMedicineAttachmentUpload(input: { attachmentType: string | null | undefined; mimetype: string; size: number }): string | null {
  if (!isMedicineAttachmentType(input.attachmentType)) return "不支持的药品附件类型";
  if (!input.mimetype.startsWith("image/")) return "请上传图片附件";
  if (input.size <= 0) return "图片内容为空";
  if (input.size > 20 * 1024 * 1024) return "图片不能超过 20MB";
  return null;
}
