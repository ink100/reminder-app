import { z } from "zod";

export const otpCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "请输入 6 位数字验证码"),
  rememberDevice: z.boolean().optional().default(false),
});
