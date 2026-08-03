export type MedicineStatus = "normal" | "expiring_soon" | "expired" | "low_stock" | "empty";
export type MedicineAttachmentType = "medicine_photo" | "medicine_location" | "medicine_content";
export type Medicine = {
  id: string; name: string; category: string; tags: string | null; quantityTotal: number | null; quantityRemaining: number | null;
  unit: string; lowStockThreshold: number | null; locationText: string | null; contentText: string | null; openedAt: string | null;
  expiresAt: string | null; expirationReminderDays: number; notes: string | null; status: MedicineStatus;
};
export type MedicineAttachment = { id: string; originalName: string; mimetype: string; size: number; url: string; attachmentType: MedicineAttachmentType; sourceLabel: string; createdAt: string };
export const categories = ["感冒发烧", "肠胃用药", "皮肤用药", "过敏用药", "心脑血管", "慢病用药", "外伤护理", "维生素/补充剂", "其他"];
export const units = ["盒", "瓶", "袋", "板", "片", "粒", "支", "包", "贴", "毫升", "克"];
export const attachmentSections = [
  { type: "medicine_photo" as const, title: "药品照片", description: "药盒、药瓶或药袋外观" },
  { type: "medicine_location" as const, title: "存放位置照片", description: "药箱、抽屉或冰箱格子" },
  { type: "medicine_content" as const, title: "药品内容照片", description: "说明书、用法、注意事项或医嘱" },
];
export const statusLabel: Record<MedicineStatus, string> = { normal: "正常", expiring_soon: "即将过期", expired: "已过期", low_stock: "库存偏低", empty: "已用完" };
export const dateInput = (value: string | null) => value ? new Date(value).toISOString().slice(0, 10) : "";
export const formatDate = (value: string | null) => value ? new Date(value).toLocaleDateString("zh-CN") : "未填写";
export const formatSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
