import { z } from "zod";

export const reminderInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().optional().nullable(),
  activationCode: z.string().trim().max(200).optional().nullable(),
  activationContact: z.string().trim().max(200).optional().nullable(),
  dueAt: z.string().datetime(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  category: z.string().trim().optional().nullable(),
  remindBeforeDays: z.number().int().min(0).max(30).default(3),
  remindBeforeHours: z.number().int().min(0).max(168).default(0),
  overdueRemindEnabled: z.boolean().default(true),
  recurrenceType: z.enum(["daily", "weekly", "monthly", "yearly"]).optional().nullable(),
  recurrenceInterval: z.number().int().min(1).max(30).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.recurrenceType && !value.recurrenceInterval) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recurrenceInterval"],
      message: "开启周期提醒后必须填写周期数值",
    });
  }

  if (!value.recurrenceType && value.recurrenceInterval) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["recurrenceType"],
      message: "请先选择周期类型",
    });
  }

  if (value.activationContact && !value.activationCode) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["activationContact"],
      message: "请先填写激活码，再补充联系方式",
    });
  }
});
