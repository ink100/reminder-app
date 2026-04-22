import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { env } from "@/lib/env";

declare global {
  var prisma: PrismaClient | undefined;
}

const adapter = new PrismaLibSql({ url: env.DATABASE_URL });

export const prisma = global.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
