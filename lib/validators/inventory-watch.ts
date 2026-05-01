import { z } from "zod";

export const inventoryWatchSettingsSchema = z
  .object({
    notifyEnabled: z.boolean().default(false),
    minNotifyStock: z.number().int().min(0).max(99999).default(0),
    maxNotifyStock: z.number().int().min(0).max(99999).default(99999),
    notifyCooldownMin: z.number().int().min(1).max(1440).default(120),
    changePercent: z.number().int().min(1).max(100).default(5),
    changePercentAuto: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.minNotifyStock > value.maxNotifyStock) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minNotifyStock"],
        message: "最小库存不能大于最大库存",
      });
    }
  });
