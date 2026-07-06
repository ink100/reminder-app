import { z } from "zod";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  APP_NAME: z.string().min(1).default("到期提醒"),
  SESSION_SECRET: z.string().min(16),
  OTP_SECRET_ENCRYPTION_KEY: z.string().min(32),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.string().regex(/^\d+$/).optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_FROM_EMAIL: z.string().email().optional(),
  SMTP_FROM_NAME: z.string().min(1).optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = envSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db",
  APP_BASE_URL: process.env.APP_BASE_URL ?? "http://localhost:3000",
  APP_NAME: process.env.APP_NAME ?? "到期提醒",
  SESSION_SECRET: process.env.SESSION_SECRET ?? "dev-session-secret-change-me",
  OTP_SECRET_ENCRYPTION_KEY:
    process.env.OTP_SECRET_ENCRYPTION_KEY ?? "0123456789abcdef0123456789abcdef",
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL,
  SMTP_FROM_NAME: process.env.SMTP_FROM_NAME,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NODE_ENV: process.env.NODE_ENV ?? "development",
});

if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

export const env = parsed.data;
