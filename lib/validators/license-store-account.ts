import { z } from "zod";

export const licenseStoreAccountInputSchema = z.object({
  shopName: z.string().trim().min(1, "店铺名不能为空").max(100, "店铺名过长"),
  phone: z.string().trim().min(1, "手机号不能为空").max(50, "手机号过长"),
  remoteCode: z.string().trim().min(1, "远程码不能为空").max(100, "远程码过长"),
  remotePassword: z.string().trim().min(1, "远程密码不能为空").max(200, "远程密码过长"),
  isOtherAccount: z.boolean().default(false),
  expiresAt: z.coerce.date({ message: "到期时间不能为空" }),
  activationCode: z.string().trim().min(1, "对应激活码不能为空").max(2048, "对应激活码过长"),
});

export type LicenseStoreAccountInput = z.infer<typeof licenseStoreAccountInputSchema>;
