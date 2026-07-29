import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import {
  applyFamilyMigrations,
  checksumMigrationArtifact,
  FAMILY_MIGRATION_PHASES,
  resolveMigrationTarget,
} from "@/scripts/apply-family-migrations";

async function previousFamilyAuthDatabase(path: string) {
  const client = createClient({ url: `file:${path}` });
  await client.execute(`PRAGMA foreign_keys = ON`);
  await client.execute(`CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY, "username" TEXT NOT NULL, "displayName" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'MEMBER', "status" TEXT NOT NULL DEFAULT 'ACTIVE', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await client.execute(`CREATE UNIQUE INDEX "User_username_key" ON "User"("username")`);
  await client.execute(`CREATE TABLE "UserTotpFactor" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "secretEncrypted" TEXT NOT NULL, "enabledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "revokedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "UserTotpFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
  await client.execute(`CREATE UNIQUE INDEX "UserTotpFactor_userId_key" ON "UserTotpFactor"("userId")`);
  await client.execute(`CREATE TABLE "AuthSession" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "authMethod" TEXT NOT NULL, "sessionTokenHash" TEXT NOT NULL, "expiresAt" DATETIME NOT NULL, "ipAddress" TEXT, "userAgent" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
  await client.execute(`CREATE TABLE "TrustedDevice" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "deviceName" TEXT, "userAgent" TEXT, "ipAddress" TEXT, "expiresAt" DATETIME NOT NULL, "lastUsedAt" DATETIME, "revokedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
  await client.execute(`CREATE TABLE "WebAuthnCredential" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "credentialId" TEXT NOT NULL, "publicKey" TEXT NOT NULL, "counter" BIGINT NOT NULL DEFAULT 0, "credentialType" TEXT NOT NULL DEFAULT 'public-key', "authenticatorType" TEXT NOT NULL DEFAULT 'platform', "deviceName" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastUsedAt" DATETIME, CONSTRAINT "WebAuthnCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
  await client.execute(`CREATE TABLE "WebAuthnChallenge" ("id" TEXT PRIMARY KEY, "challenge" TEXT NOT NULL, "expiresAt" DATETIME NOT NULL)`);
  await client.execute(`INSERT INTO "User" ("id", "username", "displayName", "role", "status") VALUES ('legacy-admin', 'old-owner', '旧管理员', 'ADMIN', 'ACTIVE')`);
  await client.execute(`INSERT INTO "UserTotpFactor" ("id", "userId", "secretEncrypted") VALUES ('old-factor', 'legacy-admin', 'existing-ciphertext')`);
  await client.execute(`INSERT INTO "AuthSession" ("id", "userId", "authMethod", "sessionTokenHash", "expiresAt") VALUES ('s1', 'legacy-admin', 'legacy', 'sh1', '2099-01-01')`);
  await client.execute(`INSERT INTO "TrustedDevice" ("id", "userId", "tokenHash", "expiresAt") VALUES ('d1', 'legacy-admin', 'th1', '2099-01-01')`);
  await client.execute(`INSERT INTO "WebAuthnCredential" ("id", "userId", "credentialId", "publicKey") VALUES ('w1', 'legacy-admin', 'c1', 'pk1')`);
  await client.execute(`INSERT INTO "WebAuthnChallenge" VALUES ('ch1', 'legacy-fixed', '2099-01-01')`);
  return client;
}

async function legacyDatabase(path: string) {
  const client = createClient({ url: `file:${path}` });
  await client.execute(`CREATE TABLE "AuthSession" ("id" TEXT PRIMARY KEY, "sessionTokenHash" TEXT NOT NULL, "expiresAt" DATETIME NOT NULL, "ipAddress" TEXT, "userAgent" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await client.execute(`CREATE UNIQUE INDEX "AuthSession_sessionTokenHash_key" ON "AuthSession"("sessionTokenHash")`);
  await client.execute(`CREATE TABLE "TrustedDevice" ("id" TEXT PRIMARY KEY, "tokenHash" TEXT NOT NULL, "deviceName" TEXT, "userAgent" TEXT, "ipAddress" TEXT, "expiresAt" DATETIME NOT NULL, "lastUsedAt" DATETIME, "revokedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await client.execute(`CREATE UNIQUE INDEX "TrustedDevice_tokenHash_key" ON "TrustedDevice"("tokenHash")`);
  await client.execute(`CREATE TABLE "WebAuthnCredential" ("id" TEXT PRIMARY KEY, "credentialId" TEXT NOT NULL, "publicKey" TEXT NOT NULL, "counter" BIGINT NOT NULL DEFAULT 0, "credentialType" TEXT NOT NULL DEFAULT 'public-key', "authenticatorType" TEXT NOT NULL DEFAULT 'platform', "deviceName" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastUsedAt" DATETIME)`);
  await client.execute(`CREATE UNIQUE INDEX "WebAuthnCredential_credentialId_key" ON "WebAuthnCredential"("credentialId")`);
  await client.execute(`CREATE TABLE "WebAuthnChallenge" ("id" TEXT PRIMARY KEY, "challenge" TEXT NOT NULL, "expiresAt" DATETIME NOT NULL)`);
  await client.execute(`INSERT INTO "AuthSession" ("id", "sessionTokenHash", "expiresAt") VALUES ('s1', 'sh1', '2099-01-01')`);
  await client.execute(`INSERT INTO "TrustedDevice" ("id", "tokenHash", "expiresAt") VALUES ('d1', 'th1', '2099-01-01')`);
  await client.execute(`INSERT INTO "WebAuthnCredential" ("id", "credentialId", "publicKey") VALUES ('w1', 'c1', 'pk1')`);
  await client.execute(`INSERT INTO "WebAuthnChallenge" VALUES ('ch1', 'legacy-fixed', '2099-01-01')`);
  return client;
}

describe("unified family migration runner", () => {
  it("mechanically hashes the loaded phase artifacts and changes when artifact bytes change", () => {
    for (const current of FAMILY_MIGRATION_PHASES) {
      expect(current.checksum).toBe(checksumMigrationArtifact(current.artifactUrl));
    }

    const artifactPath = join(tmpdir(), `family-artifact-${randomUUID()}.ts`);
    try {
      writeFileSync(artifactPath, "export const migration = 'before';\n");
      const before = checksumMigrationArtifact(pathToFileURL(artifactPath));
      writeFileSync(artifactPath, "export const migration = 'after';\n");
      expect(checksumMigrationArtifact(pathToFileURL(artifactPath))).not.toBe(before);
    } finally { rmSync(artifactPath, { force: true }); }
  });

  it("fails closed when the journal contains a checksum from different artifact bytes", async () => {
    const path = join(tmpdir(), `family-artifact-journal-${randomUUID()}.db`);
    const artifactPath = join(tmpdir(), `family-old-artifact-${randomUUID()}.ts`);
    const client = await legacyDatabase(path);
    try {
      await applyFamilyMigrations({ client, databaseUrl: `file:${path}`, backup: false, environment: { NODE_ENV: "test" } });
      writeFileSync(artifactPath, "old migration implementation\n");
      await client.execute({
        sql: `UPDATE "FamilyMigrationJournal" SET "checksum" = ? WHERE "phase" = 'family-auth-v1'`,
        args: [checksumMigrationArtifact(pathToFileURL(artifactPath))],
      });
      await expect(applyFamilyMigrations({ client, databaseUrl: `file:${path}`, backup: false, environment: { NODE_ENV: "test" } }))
        .rejects.toThrow(/journal mismatch/i);
    } finally {
      client.close();
      rmSync(path, { force: true });
      rmSync(artifactPath, { force: true });
    }
  });

  it("keeps phase modules import-only so operators cannot bypass the unified runner", () => {
    for (const file of ["apply-family-auth-v1.ts", "apply-family-members-v1.ts", "apply-auth-quality-v1.ts"]) {
      const source = readFileSync(join(process.cwd(), "scripts", file), "utf8");
      expect(source).not.toContain("async function main()");
      expect(source).not.toContain("process.argv[1]");
    }
  });

  it("migrates the legacy TOTP-only owner identity and ciphertext inside the unified transaction", async () => {
    const path = join(tmpdir(), `family-legacy-totp-${randomUUID()}.db`);
    const client = await legacyDatabase(path);
    try {
      await client.execute(`CREATE TABLE "AppSetting" ("id" INTEGER NOT NULL PRIMARY KEY, "otpSecretEncrypted" TEXT)`);
      await client.execute(`INSERT INTO "AppSetting" ("id", "otpSecretEncrypted") VALUES (1, 'legacy-ciphertext')`);

      await applyFamilyMigrations({
        client,
        databaseUrl: `file:${path}`,
        backup: false,
        environment: {
          NODE_ENV: "test",
          LEGACY_ADMIN_USERNAME: "FamilyOwner",
          LEGACY_ADMIN_DISPLAY_NAME: "家庭所有者",
        },
      });

      const owner = (await client.execute(`SELECT "username", "displayName", "role", "status" FROM "User" WHERE "id" = 'legacy-admin'`)).rows[0];
      expect(owner).toMatchObject({ username: "familyowner", displayName: "家庭所有者", role: "ADMIN", status: "ACTIVE" });
      expect((await client.execute(`SELECT "secretEncrypted" FROM "UserTotpFactor" WHERE "userId" = 'legacy-admin'`)).rows[0]?.secretEncrypted)
        .toBe("legacy-ciphertext");
    } finally { client.close(); rmSync(path, { force: true }); }
  });

  it("upgrades and reruns a database produced by the previous supported family-auth command", async () => {
    const path = join(tmpdir(), `family-previous-auth-${randomUUID()}.db`);
    const client = await previousFamilyAuthDatabase(path);
    try {
      const environment = {
        NODE_ENV: "test",
        LEGACY_ADMIN_USERNAME: "old-owner",
        LEGACY_ADMIN_DISPLAY_NAME: "旧管理员",
      };
      const first = await applyFamilyMigrations({ client, databaseUrl: `file:${path}`, backup: false, environment });
      expect(first.appliedPhases).toBe(3);
      expect((await client.execute(`SELECT "secretEncrypted" FROM "UserTotpFactor" WHERE "userId" = 'legacy-admin'`)).rows[0]?.secretEncrypted)
        .toBe("existing-ciphertext");
      const userUpdatedAt = (await client.execute(`PRAGMA table_info("User")`)).rows.find((row) => row.name === "updatedAt");
      expect(String(userUpdatedAt?.dflt_value)).toBe("CURRENT_TIMESTAMP");

      const second = await applyFamilyMigrations({ client, databaseUrl: `file:${path}`, backup: false, environment });
      expect(second.appliedPhases).toBe(0);
      expect(second.skippedPhases).toBe(3);
    } finally { client.close(); rmSync(path, { force: true }); }
  });

  it("refuses unknown columns in every rebuilt legacy auth table without losing sentinel data", async () => {
    for (const table of ["AuthSession", "TrustedDevice", "WebAuthnCredential", "WebAuthnChallenge"]) {
      const path = join(tmpdir(), `family-unknown-${table}-${randomUUID()}.db`);
      const client = await legacyDatabase(path);
      try {
        await client.execute(`ALTER TABLE "${table}" ADD COLUMN "unexpectedLegacyData" TEXT`);
        await client.execute(`UPDATE "${table}" SET "unexpectedLegacyData" = 'preserve-me'`);

        await expect(applyFamilyMigrations({ client, databaseUrl: `file:${path}`, backup: false, environment: { NODE_ENV: "test" } }))
          .rejects.toThrow(/unexpected column/i);
        expect((await client.execute(`SELECT "unexpectedLegacyData" FROM "${table}"`)).rows[0]?.unexpectedLegacyData)
          .toBe("preserve-me");
        expect(Number((await client.execute(`SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='table' AND name='FamilyMigrationJournal'`)).rows[0]?.count))
          .toBe(0);
      } finally { client.close(); rmSync(path, { force: true }); }
    }
  });

  it("backs up a real file database, runs fixed phases once, and safely reruns", async () => {
    const path = join(tmpdir(), `family-runner-${randomUUID()}.db`);
    const client = await legacyDatabase(path);
    try {
      const first = await applyFamilyMigrations({ client, databaseUrl: `file:${path}`, backup: true });
      expect(first.appliedPhases).toBe(3);
      expect(first.backupPath && existsSync(first.backupPath)).toBe(true);
      const second = await applyFamilyMigrations({ client, databaseUrl: `file:${path}`, backup: false, environment: { NODE_ENV: "test" } });
      expect(second.appliedPhases).toBe(0);
      expect(Number((await client.execute(`SELECT COUNT(*) AS count FROM "FamilyMigrationJournal" WHERE "status" = 'applied'`)).rows[0]?.count)).toBe(3);
      expect(Number((await client.execute(`SELECT COUNT(*) AS count FROM "WebAuthnChallengeLegacyArchive"`)).rows[0]?.count)).toBe(1);
    } finally {
      client.close();
      rmSync(path, { force: true });
    }
  });

  it("fails closed for remote libsql until an external snapshot is confirmed", () => {
    expect(() => resolveMigrationTarget("libsql://example.invalid", {})).toThrow(/external snapshot/i);
    expect(resolveMigrationTarget("libsql://example.invalid", { FAMILY_MIGRATION_EXTERNAL_SNAPSHOT_CONFIRMED: "true" }).localPath).toBeNull();
  });

  it("canonicalizes relative file URLs and restricts backup=false to tests", async () => {
    expect(resolveMigrationTarget("file:./relative-family.db").localPath).toBe(join(process.cwd(), "relative-family.db"));
    const path = join(tmpdir(), `family-no-backup-${randomUUID()}.db`);
    const client = await legacyDatabase(path);
    try {
      await expect(applyFamilyMigrations({ client, databaseUrl: `file:${path}`, backup: false, environment: { NODE_ENV: "production" } })).rejects.toThrow(/backup=false/i);
    } finally { client.close(); rmSync(path, { force: true }); }
  });

  it("creates a validated regular backup", async () => {
    const path = join(tmpdir(), `family-backup-${randomUUID()}.db`);
    const client = await legacyDatabase(path);
    let backupPath: string | null = null;
    try {
      backupPath = (await applyFamilyMigrations({ client, databaseUrl: `file:${path}` })).backupPath;
      const stat = lstatSync(backupPath!);
      expect(stat.isFile()).toBe(true);
      expect(stat.isSymbolicLink()).toBe(false);
      expect(stat.size).toBeGreaterThan(0);
    } finally { client.close(); rmSync(path, { force: true }); if (backupPath) rmSync(backupPath, { force: true }); }
  });

  it("rolls back every phase and journal mark when journaling fails", async () => {
    const path = join(tmpdir(), `family-rollback-${randomUUID()}.db`);
    const client = await legacyDatabase(path);
    try {
      await client.execute(`CREATE TABLE "FamilyMigrationJournal" ("phase" TEXT NOT NULL PRIMARY KEY, "version" INTEGER NOT NULL, "checksum" TEXT NOT NULL, "status" TEXT NOT NULL, "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
      await client.execute(`CREATE TRIGGER "reject_journal" BEFORE INSERT ON "FamilyMigrationJournal" BEGIN SELECT RAISE(ABORT, 'journal rejected'); END`);
      await expect(applyFamilyMigrations({ client, databaseUrl: `file:${path}`, backup: false, environment: { NODE_ENV: "test" } })).rejects.toThrow(/journal rejected/i);
      expect(Number((await client.execute(`SELECT COUNT(*) AS count FROM sqlite_schema WHERE type='table' AND name='User'`)).rows[0]?.count)).toBe(0);
      expect(Number((await client.execute(`SELECT COUNT(*) AS count FROM "FamilyMigrationJournal"`)).rows[0]?.count)).toBe(0);
    } finally { client.close(); rmSync(path, { force: true }); }
  });

  it("fails closed for an incompatible journal mark", async () => {
    const path = join(tmpdir(), `family-bad-mark-${randomUUID()}.db`);
    const client = await legacyDatabase(path);
    try {
      await client.execute(`CREATE TABLE "FamilyMigrationJournal" ("phase" TEXT NOT NULL PRIMARY KEY, "version" INTEGER NOT NULL, "checksum" TEXT NOT NULL, "status" TEXT NOT NULL, "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
      await client.execute(`INSERT INTO "FamilyMigrationJournal" VALUES ('family-auth-v1',1,'invalid','applied',CURRENT_TIMESTAMP)`);
      await expect(applyFamilyMigrations({ client, databaseUrl: `file:${path}`, backup: false, environment: { NODE_ENV: "test" } })).rejects.toThrow(/journal/i);
    } finally { client.close(); rmSync(path, { force: true }); }
  });

  it("rejects a correctly named index on the wrong column", async () => {
    const path = join(tmpdir(), `family-index-${randomUUID()}.db`);
    const client = await legacyDatabase(path);
    try {
      await applyFamilyMigrations({ client, databaseUrl: `file:${path}`, backup: false, environment: { NODE_ENV: "test" } });
      await client.execute(`DROP INDEX "AuthSession_userId_idx"`);
      await client.execute(`CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("expiresAt")`);
      await expect(applyFamilyMigrations({ client, databaseUrl: `file:${path}`, backup: false, environment: { NODE_ENV: "test" } })).rejects.toThrow(/index/i);
    } finally { client.close(); rmSync(path, { force: true }); }
  });

  it("serializes concurrent runners", async () => {
    const path = join(tmpdir(), `family-concurrent-${randomUUID()}.db`);
    const first = await legacyDatabase(path);
    const second = createClient({ url: `file:${path}` });
    try {
      const results = await Promise.all([
        applyFamilyMigrations({ client: first, databaseUrl: `file:${path}`, backup: false, environment: { NODE_ENV: "test" } }),
        applyFamilyMigrations({ client: second, databaseUrl: `file:${path}`, backup: false, environment: { NODE_ENV: "test" } }),
      ]);
      expect(results.map((r) => r.appliedPhases).sort()).toEqual([0, 3]);
      expect(Number((await first.execute(`SELECT COUNT(*) AS count FROM "FamilyMigrationJournal"`)).rows[0]?.count)).toBe(3);
    } finally { first.close(); second.close(); rmSync(path, { force: true }); }
  });

  it("recovers a stale local lock left by a dead process", async () => {
    const path = join(tmpdir(), `family-stale-lock-${randomUUID()}.db`);
    const client = await legacyDatabase(path);
    const lockPath = `${path}.family-migration.lock`;
    writeFileSync(lockPath, `999999999\n2000-01-01T00:00:00.000Z\n`, { mode: 0o600 });
    try {
      await expect(applyFamilyMigrations({ client, databaseUrl: `file:${path}`, backup: false, environment: { NODE_ENV: "test" } })).resolves.toMatchObject({ appliedPhases: 3 });
      expect(existsSync(lockPath)).toBe(false);
    } finally { client.close(); rmSync(path, { force: true }); rmSync(lockPath, { force: true }); }
  });
});