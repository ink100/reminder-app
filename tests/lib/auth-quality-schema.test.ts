import { createClient } from "@libsql/client";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { applyAuthQualityMigration, buildAuthQualityMigrationPlan } from "../../scripts/apply-auth-quality-v1";

describe("auth quality migration", () => {
  it("links trusted-device sessions in the Prisma schema", async () => {
    const schema = await import("node:fs/promises").then(({ readFile }) => readFile("prisma/schema.prisma", "utf8"));
    expect(schema).toMatch(/model AuthSession[\s\S]*trustedDeviceId\s+String\?/);
    expect(schema).toMatch(/trustedDevice\s+TrustedDevice\?\s+@relation/);
    expect(schema).toMatch(/model TrustedDevice[\s\S]*sessions\s+AuthSession\[\]/);
  });

  it("adds durable throttle and version snapshot/backfill changes only when needed", () => {
    const plan = buildAuthQualityMigrationPlan({
      AuthSession: new Set(["id", "userId"]), TrustedDevice: new Set(["id", "userId"]), LoginThrottle: new Set(),
    }).join("\n");
    expect(plan).toContain('AuthSession" ADD COLUMN "securityVersion"');
    expect(plan).toContain('TrustedDevice" ADD COLUMN "securityVersion"');
    expect(plan).toContain('CREATE TABLE IF NOT EXISTS "LoginThrottle"');
    expect(plan).toContain('SELECT "securityVersion" FROM "User"');
    expect(plan).toContain('"trustedDeviceId" TEXT');
    expect(plan).toContain('ON DELETE CASCADE');
    expect(plan).toContain('AuthSession_trustedDeviceId_idx');
  });

  it("is idempotent and preserves rows while backfilling current versions", async () => {
    const databasePath = join(tmpdir(), `auth-quality-${randomUUID()}.db`);
    const client = createClient({ url: `file:${databasePath}` });
    try {
      await client.execute('CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "securityVersion" INTEGER NOT NULL)');
      await client.execute('CREATE TABLE "AuthSession" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "authMethod" TEXT NOT NULL, "sessionTokenHash" TEXT NOT NULL, "expiresAt" DATETIME NOT NULL, "ipAddress" TEXT, "userAgent" TEXT, "trustedDeviceId" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE)');
      await client.execute('CREATE UNIQUE INDEX "AuthSession_sessionTokenHash_key" ON "AuthSession"("sessionTokenHash")');
      await client.execute('CREATE TABLE "TrustedDevice" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "deviceName" TEXT, "userAgent" TEXT, "ipAddress" TEXT, "expiresAt" DATETIME NOT NULL, "lastUsedAt" DATETIME, "revokedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE)');
      await client.execute('INSERT INTO "User" VALUES (\'u1\', 3)');
      await client.execute(`INSERT INTO "TrustedDevice" ("id", "userId", "tokenHash", "expiresAt") VALUES ('d1', 'u1', 'token-1', '2099-01-01')`);
      await client.execute(`INSERT INTO "AuthSession" ("id", "userId", "authMethod", "sessionTokenHash", "expiresAt") VALUES ('s1', 'u1', 'trusted', 'session-1', '2099-01-01')`);
      await applyAuthQualityMigration(client);
      await client.execute('UPDATE "User" SET "securityVersion" = 4 WHERE "id" = \'u1\'');
      await applyAuthQualityMigration(client);
      // Idempotent reruns preserve intentionally stale snapshots created by later revocation.
      expect(Number((await client.execute('SELECT "securityVersion" FROM "AuthSession"')).rows[0]?.securityVersion)).toBe(3);
      expect(Number((await client.execute('SELECT "securityVersion" FROM "TrustedDevice"')).rows[0]?.securityVersion)).toBe(3);
      expect(Number((await client.execute('SELECT COUNT(*) AS count FROM "LoginThrottle"')).rows[0]?.count)).toBe(0);
      expect((await client.execute("SELECT * FROM pragma_foreign_key_check")).rows).toHaveLength(0);
      const fk = (await client.execute(`PRAGMA foreign_key_list("AuthSession")`)).rows;
      expect(fk.some((row) => row.from === "trustedDeviceId" && row.table === "TrustedDevice" && row.on_delete === "CASCADE")).toBe(true);
      await client.execute(`UPDATE "AuthSession" SET "trustedDeviceId" = 'd1' WHERE "id" = 's1'`);
      await client.execute(`DELETE FROM "TrustedDevice" WHERE "id" = 'd1'`);
      expect(Number((await client.execute(`SELECT COUNT(*) AS count FROM "AuthSession"`)).rows[0]?.count)).toBe(0);
    } finally {
      client.close();
      rmSync(databasePath, { force: true });
    }
  });

  it("rolls back every auth-quality statement when safe reconstruction is refused", async () => {
    const databasePath = join(tmpdir(), `auth-quality-rollback-${randomUUID()}.db`);
    const client = createClient({ url: `file:${databasePath}` });
    try {
      await client.execute('CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "securityVersion" INTEGER NOT NULL)');
      await client.execute('CREATE TABLE "TrustedDevice" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "securityVersion" INTEGER NOT NULL)');
      await client.execute('CREATE TABLE "AuthSession" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "authMethod" TEXT NOT NULL, "sessionTokenHash" TEXT NOT NULL, "expiresAt" DATETIME NOT NULL, "ipAddress" TEXT, "userAgent" TEXT, "trustedDeviceId" TEXT, "unexpectedLegacyField" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)');
      await expect(applyAuthQualityMigration(client)).rejects.toThrow(/safely rebuilt/i);
      const authColumns = (await client.execute('PRAGMA table_info("AuthSession")')).rows.map((row) => row.name);
      expect(authColumns).not.toContain("securityVersion");
      expect((await client.execute(`SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='table' AND name='LoginThrottle'`)).rows[0]?.count).toBe(0);
    } finally {
      client.close();
      rmSync(databasePath, { force: true });
    }
  });
});
