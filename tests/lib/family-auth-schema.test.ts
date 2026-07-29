import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { applyFamilyAuthMigration, buildFamilyAuthMigrationPlan } from "@/scripts/apply-family-auth-v1";

describe("family auth v1 schema migration", () => {
  it("creates the legacy admin before adding owned authentication columns", () => {
    const plan = buildFamilyAuthMigrationPlan({
      AuthSession: new Set(["id", "sessionTokenHash"]),
      TrustedDevice: new Set(["id", "tokenHash"]),
      WebAuthnCredential: new Set(["id", "credentialId"]),
    });

    expect(plan[0]).toContain('CREATE TABLE IF NOT EXISTS "User"');
    expect(plan.join("\n")).toContain("legacy-admin");
    expect(plan.join("\n")).toContain('CREATE TABLE "new_AuthSession"');
    expect(plan.join("\n")).toContain('CREATE TABLE "new_TrustedDevice"');
    expect(plan.join("\n")).toContain('CREATE TABLE "new_WebAuthnCredential"');
    expect(plan.join("\n")).toContain('FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE');
    expect(plan.join("\n")).not.toContain("ADD COLUMN");
  });

  it("is idempotent when authentication ownership columns already exist", () => {
    const plan = buildFamilyAuthMigrationPlan({
      AuthSession: new Set(["id", "userId", "authMethod"]),
      TrustedDevice: new Set(["id", "userId"]),
      WebAuthnCredential: new Set(["id", "userId"]),
    });

    expect(plan.some((statement) => statement.includes("new_AuthSession"))).toBe(false);
  });

  it("preserves real ownership when only authMethod is absent", async () => {
    const path = join(tmpdir(), `family-auth-partial-${randomUUID()}.db`);
    const client = createClient({ url: `file:${path}` });
    try {
      await client.execute(`CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY, "username" TEXT NOT NULL, "displayName" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'MEMBER', "status" TEXT NOT NULL DEFAULT 'ACTIVE', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)`);
      await client.execute(`CREATE UNIQUE INDEX "User_username_key" ON "User"("username")`);
      await client.execute(`INSERT INTO "User" VALUES ('u1','u1','U1','MEMBER','ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
      await client.execute(`CREATE TABLE "AuthSession" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "sessionTokenHash" TEXT NOT NULL, "expiresAt" DATETIME NOT NULL, "ipAddress" TEXT, "userAgent" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
      await client.execute(`CREATE TABLE "TrustedDevice" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "deviceName" TEXT, "userAgent" TEXT, "ipAddress" TEXT, "expiresAt" DATETIME NOT NULL, "lastUsedAt" DATETIME, "revokedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
      await client.execute(`CREATE TABLE "WebAuthnCredential" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "credentialId" TEXT NOT NULL, "publicKey" TEXT NOT NULL, "counter" BIGINT NOT NULL DEFAULT 0, "credentialType" TEXT NOT NULL DEFAULT 'public-key', "authenticatorType" TEXT NOT NULL DEFAULT 'platform', "deviceName" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastUsedAt" DATETIME, FOREIGN KEY("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
      await client.execute(`INSERT INTO "AuthSession" ("id","userId","sessionTokenHash","expiresAt") VALUES ('s1','u1','h','2099-01-01')`);
      await applyFamilyAuthMigration(client);
      expect((await client.execute(`SELECT "userId", "authMethod" FROM "AuthSession"`)).rows[0]).toMatchObject({ userId: "u1", authMethod: "legacy" });
    } finally {
      client.close();
      rmSync(path, { force: true });
    }
  });
});