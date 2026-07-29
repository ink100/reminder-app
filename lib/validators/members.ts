import { z } from "zod";

const username = z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/).transform((value) => value.toLowerCase());

export const createMemberInviteSchema = z.object({
  username,
  displayName: z.string().trim().min(1).max(100),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
  expiresInHours: z.number().int().min(1).max(24 * 30).default(72),
});

export const updateMemberSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
}).refine((value) => value.role !== undefined || value.status !== undefined, "No update supplied");
