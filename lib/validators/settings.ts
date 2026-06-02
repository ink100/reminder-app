import { z } from "zod";

export const settingsInputSchema = z.object({
  appName: z.string().trim().min(1).max(100),
  timezone: z.string().trim().min(1).max(100),
  emailNotificationsEnabled: z.boolean(),
  notificationEmail: z.email().optional().nullable(),
  smtpHost: z.string().trim().max(200),
  smtpPort: z.number().int().min(1).max(65535),
  smtpUser: z.string().trim().max(200),
  smtpPass: z.string().max(2000),
  smtpFromEmail: z.email().or(z.literal("")),
  smtpFromName: z.string().trim().max(200),
  clearSmtpPass: z.boolean(),
  // 定时任务配置
  reminderEmailEnabled: z.boolean().optional(),
  reminderEmailInterval: z.number().int().min(60).max(86400).optional(),
  notifyStartHour: z.number().int().min(0).max(23).optional(),
  notifyEndHour: z.number().int().min(0).max(23).optional(),
}).superRefine((value, ctx) => {
  if (value.emailNotificationsEnabled && !value.notificationEmail) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["notificationEmail"],
      message: "开启邮件提醒后必须填写接收邮箱",
    });
  }
});
