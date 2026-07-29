import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { applyFamilyMembersMigration, buildFamilyMembersMigrationPlan } from "@/scripts/apply-family-members-v1";

describe("family members v1 migration", () => {
  it("adds lifecycle and secure enrollment tables while archiving untrusted fixed challenges", () => {
    const plan = buildFamilyMembersMigrationPlan({
      User: new Set(["id", "username", "status"]),
      WebAuthnChallenge: new Set(["id", "challenge", "expiresAt"]),
    });
    const sql = plan.join("\n");
    expect(sql).toContain('ADD COLUMN "securityVersion"');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "MemberInvitation"');
    expect(sql).toContain('"tokenHash" TEXT NOT NULL');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "PendingTotpEnrollment"');
    expect(sql).toContain('WebAuthnChallengeLegacyArchive');
    expect(sql).toContain('usableForAuthentication');
    expect(sql).toContain('DROP TABLE "WebAuthnChallenge"');
    expect(sql).toContain('FOREIGN KEY ("targetUserId") REFERENCES "User"');
  });

  it("is idempotent for the phase-2 schema", () => {
    const plan = buildFamilyMembersMigrationPlan({
      User: new Set(["id", "username", "status", "securityVersion", "activatedAt", "disabledAt"]),
      WebAuthnChallenge: new Set(["id", "challenge", "flow", "userId", "browserTokenHash", "expiresAt", "consumedAt", "createdAt"]),
    });
    expect(plan.some((sql) => sql.includes("ADD COLUMN"))).toBe(false);
    expect(plan.some((sql) => sql.includes('DROP TABLE "WebAuthnChallenge"'))).toBe(false);
    expect(plan.every((sql) => /IF NOT EXISTS|INSERT OR IGNORE|UPDATE/.test(sql))).toBe(true);
  });

  it("applies twice, preserves users, archives fixed challenges, and passes FK checks", async () => {
    const databasePath = join(tmpdir(), `family-members-${randomUUID()}.db`);
    const client = createClient({ url: `file:${databasePath}` });
    try {
      await client.execute(`CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "username" TEXT NOT NULL, "displayName" TEXT NOT NULL, "role" TEXT NOT NULL, "status" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
      await client.execute(`INSERT INTO "User" ("id", "username", "displayName", "role", "status") VALUES ('legacy-admin', 'admin', 'Admin', 'ADMIN', 'ACTIVE'), ('member', 'member', 'Member', 'MEMBER', 'ACTIVE')`);
      await client.execute(`CREATE TABLE "UserTotpFactor" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL UNIQUE, "secretEncrypted" TEXT NOT NULL, "enabledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "revokedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
      await client.execute(`CREATE TABLE "WebAuthnChallenge" ("id" TEXT PRIMARY KEY, "challenge" TEXT NOT NULL, "expiresAt" DATETIME NOT NULL)`);
      await client.execute(`INSERT INTO "WebAuthnChallenge" VALUES ('current', 'fixed-untrusted', CURRENT_TIMESTAMP)`);
      await applyFamilyMembersMigration(client);
      await applyFamilyMembersMigration(client);
      expect(Number((await client.execute('SELECT COUNT(*) AS count FROM "User"')).rows[0]?.count)).toBe(2);
      expect(Number((await client.execute('SELECT COUNT(*) AS count FROM "WebAuthnChallenge"')).rows[0]?.count)).toBe(0);
      expect(Number((await client.execute('SELECT COUNT(*) AS count FROM "WebAuthnChallengeLegacyArchive"')).rows[0]?.count)).toBe(1);
      expect(Number((await client.execute('SELECT "usableForAuthentication" FROM "WebAuthnChallengeLegacyArchive"')).rows[0]?.usableForAuthentication)).toBe(0);
      expect((await client.execute("SELECT * FROM pragma_foreign_key_check")).rows).toHaveLength(0);
    } finally {
      client.close();
      rmSync(databasePath, { force: true });
    }
  });

  it("fails closed without changing the schema for an unknown user status", async () => {
    const databasePath = join(tmpdir(), `family-members-status-${randomUUID()}.db`);
    const client = createClient({ url: `file:${databasePath}` });
    try {
      await client.execute(`CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "username" TEXT NOT NULL, "displayName" TEXT NOT NULL, "role" TEXT NOT NULL, "status" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
      await client.execute(`INSERT INTO "User" ("id", "username", "displayName", "role", "status") VALUES ('legacy-admin', 'admin', 'Admin', 'ADMIN', 'SUSPICIOUS')`);
      await client.execute(`CREATE TABLE "UserTotpFactor" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "secretEncrypted" TEXT NOT NULL)`);
      await client.execute(`CREATE TABLE "WebAuthnChallenge" ("id" TEXT PRIMARY KEY, "challenge" TEXT NOT NULL, "expiresAt" DATETIME NOT NULL)`);
      await expect(applyFamilyMembersMigration(client)).rejects.toThrow(/unknown user status/i);
      expect((await client.execute(`PRAGMA table_info("User")`)).rows.map((row) => row.name)).not.toContain("securityVersion");
      expect(String((await client.execute(`SELECT "status" FROM "User"`)).rows[0]?.status)).toBe("SUSPICIOUS");
    } finally {
      client.close();
      rmSync(databasePath, { force: true });
    }
  });
});
