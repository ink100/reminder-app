import { describe, expect, it } from "vitest";

import {
  MEDICINE_ATTACHMENT_TYPES,
  getMedicineAttachmentLabel,
  getMedicineStatus,
  parseMedicineInput,
  validateMedicineAttachmentUpload,
  type MedicineRecord,
} from "@/lib/medicines";

function medicine(overrides: Partial<MedicineRecord>): MedicineRecord {
  return {
    id: "m1",
    name: "布洛芬",
    category: "感冒发烧",
    tags: null,
    quantityTotal: 24,
    quantityRemaining: 12,
    unit: "片",
    lowStockThreshold: 3,
    locationText: null,
    contentText: null,
    openedAt: null,
    expiresAt: null,
    expirationReminderDays: 30,
    expirationReminderId: null,
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("medicine helpers", () => {
  it("parses human medicine input with opening date, location, content and quantities", () => {
    expect(parseMedicineInput({
      name: "  布洛芬缓释胶囊  ",
      category: "感冒发烧",
      tags: "退烧,止痛",
      quantityTotal: "24",
      quantityRemaining: "6",
      unit: "粒",
      lowStockThreshold: "4",
      locationText: "客厅药箱",
      contentText: "饭后服用",
      openedAt: "2026-01-02",
      expiresAt: "2026-03-01",
      expirationReminderDays: "14",
      notes: "仅考虑人用",
    })).toEqual({
      name: "布洛芬缓释胶囊",
      category: "感冒发烧",
      tags: "退烧,止痛",
      quantityTotal: 24,
      quantityRemaining: 6,
      unit: "粒",
      lowStockThreshold: 4,
      locationText: "客厅药箱",
      contentText: "饭后服用",
      openedAt: "2026-01-02",
      expiresAt: "2026-03-01",
      expirationReminderDays: 14,
      notes: "仅考虑人用",
    });
  });

  it("rejects invalid quantities, category and reminder window", () => {
    expect(() => parseMedicineInput({ name: "药", category: "宠物药", unit: "盒" })).toThrow("请选择有效的药品分类");
    expect(() => parseMedicineInput({ name: "药", category: "其他", unit: "盒", quantityRemaining: -1 })).toThrow("数量不能为负数");
    expect(() => parseMedicineInput({ name: "药", category: "其他", unit: "盒", expirationReminderDays: 4000 })).toThrow("过期提醒天数必须在 0 到 3650 之间");
  });

  it("computes status for expired, empty, expiring and low stock medicines", () => {
    const now = new Date("2026-02-01T12:00:00.000Z");
    expect(getMedicineStatus(medicine({ expiresAt: new Date("2026-01-31T00:00:00.000Z") }), now)).toBe("expired");
    expect(getMedicineStatus(medicine({ quantityRemaining: 0, expiresAt: new Date("2026-12-01T00:00:00.000Z") }), now)).toBe("empty");
    expect(getMedicineStatus(medicine({ expiresAt: new Date("2026-02-20T00:00:00.000Z") }), now)).toBe("expiring_soon");
    expect(getMedicineStatus(medicine({ quantityRemaining: 2, lowStockThreshold: 3, expiresAt: new Date("2026-12-01T00:00:00.000Z") }), now)).toBe("low_stock");
    expect(getMedicineStatus(medicine({ quantityRemaining: null, lowStockThreshold: null, expiresAt: null }), now)).toBe("normal");
  });

  it("validates split medicine image attachment types", () => {
    expect(getMedicineAttachmentLabel(MEDICINE_ATTACHMENT_TYPES.photo)).toBe("药品照片");
    expect(getMedicineAttachmentLabel(MEDICINE_ATTACHMENT_TYPES.location)).toBe("存放位置照片");
    expect(getMedicineAttachmentLabel(MEDICINE_ATTACHMENT_TYPES.content)).toBe("药品内容照片");
    expect(validateMedicineAttachmentUpload({ attachmentType: MEDICINE_ATTACHMENT_TYPES.photo, mimetype: "image/jpeg", size: 1024 })).toBeNull();
    expect(validateMedicineAttachmentUpload({ attachmentType: "other", mimetype: "image/jpeg", size: 1024 })).toBe("不支持的药品附件类型");
    expect(validateMedicineAttachmentUpload({ attachmentType: MEDICINE_ATTACHMENT_TYPES.photo, mimetype: "text/plain", size: 1024 })).toBe("请上传图片附件");
  });
});
