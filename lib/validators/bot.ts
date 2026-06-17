import { z } from "zod";

export const telegramBotSettingsSchema = z.object({
  enabled: z.boolean(),
  token: z.string().trim().max(2000).optional().default(""),
  clearToken: z.boolean().optional().default(false),
  chatId: z.string().trim().max(200).optional().default(""),
}).superRefine((value, ctx) => {
  if (value.enabled && !value.chatId.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["chatId"],
      message: "启用 Telegram Bot 通知后必须填写 Chat ID",
    });
  }

  if (value.clearToken && value.token.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["token"],
      message: "清空 Token 时不要同时填写新 Token",
    });
  }
});

export const telegramBotTestSchema = z.object({
  message: z.string().trim().min(1).max(1000).optional(),
});
