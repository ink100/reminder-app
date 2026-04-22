import { z } from "zod";

export const inventoryWatchSettingsSchema = z
  .object({
    notifyEnabled: z.boolean().default(false),
    minNotifyStock: z.number().int().min(0).max(99999).default(0),
    maxNotifyStock: z.number().int().min(0).max(99999).default(99999),
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
