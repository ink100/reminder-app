import { createClient, type Client, type Transaction } from "@libsql/client";
import { loadEnvConfig } from "@next/env";
import { createHash, randomUUID } from "node:crypto";
import { lstat, open, unlink } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { FAMILY_AUTH_MIGRATION_ARTIFACT_URL, applyFamilyAuthMigration } from "./apply-family-auth-v1";
import { FAMILY_MEMBERS_MIGRATION_ARTIFACT_URL, applyFamilyMembersMigration } from "./apply-family-members-v1";
import { AUTH_QUALITY_MIGRATION_ARTIFACT_URL, applyAuthQualityMigration } from "./apply-auth-quality-v1";

type Db = Client | Transaction;
type ColumnSpec = readonly [name: string, type: string, notNull: boolean, defaultValue: string | null, primaryKey?: boolean];

export function checksumMigrationArtifact(artifactUrl: string | URL) {
  const path = typeof artifactUrl === "string" && artifactUrl.startsWith("file:") ? new URL(artifactUrl) : artifactUrl;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const phase = (name: string, version: number, artifactUrl: string, apply: (client: Client, tx: Transaction, environment: Record<string, string | undefined>) => Promise<unknown>) => ({
  name,
  version,
  artifactUrl,
  checksum: checksumMigrationArtifact(artifactUrl),
  apply,
});

export const FAMILY_MIGRATION_PHASES = [
  phase("family-auth-v1", 1, FAMILY_AUTH_MIGRATION_ARTIFACT_URL, applyFamilyAuthMigration),
  phase("family-members-v1", 1, FAMILY_MEMBERS_MIGRATION_ARTIFACT_URL, applyFamilyMembersMigration),
  phase("auth-quality-v1", 1, AUTH_QUALITY_MIGRATION_ARTIFACT_URL, applyAuthQualityMigration),
] as const;

const JOURNAL_SQL = `CREATE TABLE IF NOT EXISTS "FamilyMigrationJournal" (
  "phase" TEXT NOT NULL PRIMARY KEY,
  "version" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

const C = (name: string, type: string, notNull: boolean, defaultValue: string | null, primaryKey = false): ColumnSpec => [name, type, notNull, defaultValue, primaryKey];
const TABLES: Record<string, readonly ColumnSpec[]> = {
  User: [C("id", "TEXT", true, null, true), C("username", "TEXT", true, null), C("displayName", "TEXT", true, null), C("role", "TEXT", true, "'MEMBER'"), C("status", "TEXT", true, "'ACTIVE'"), C("securityVersion", "INTEGER", true, "0"), C("activatedAt", "DATETIME", false, null), C("disabledAt", "DATETIME", false, null), C("createdAt", "DATETIME", true, "CURRENT_TIMESTAMP"), C("updatedAt", "DATETIME", true, null)],
  UserTotpFactor: [C("id", "TEXT", true, null, true), C("userId", "TEXT", true, null), C("secretEncrypted", "TEXT", true, null), C("enabledAt", "DATETIME", true, "CURRENT_TIMESTAMP"), C("revokedAt", "DATETIME", false, null), C("createdAt", "DATETIME", true, "CURRENT_TIMESTAMP"), C("updatedAt", "DATETIME", true, null), C("lastAcceptedStep", "INTEGER", false, null)],
  AuthSession: [C("id", "TEXT", true, null, true), C("userId", "TEXT", true, null), C("authMethod", "TEXT", true, null), C("securityVersion", "INTEGER", true, "0"), C("sessionTokenHash", "TEXT", true, null), C("expiresAt", "DATETIME", true, null), C("ipAddress", "TEXT", false, null), C("userAgent", "TEXT", false, null), C("trustedDeviceId", "TEXT", false, null), C("createdAt", "DATETIME", true, "CURRENT_TIMESTAMP"), C("lastSeenAt", "DATETIME", true, "CURRENT_TIMESTAMP")],
  TrustedDevice: [C("id", "TEXT", true, null, true), C("userId", "TEXT", true, null), C("tokenHash", "TEXT", true, null), C("securityVersion", "INTEGER", true, "0"), C("deviceName", "TEXT", false, null), C("userAgent", "TEXT", false, null), C("ipAddress", "TEXT", false, null), C("expiresAt", "DATETIME", true, null), C("lastUsedAt", "DATETIME", false, null), C("revokedAt", "DATETIME", false, null), C("createdAt", "DATETIME", true, "CURRENT_TIMESTAMP")],
  WebAuthnCredential: [C("id", "TEXT", true, null, true), C("userId", "TEXT", true, null), C("credentialId", "TEXT", true, null), C("publicKey", "TEXT", true, null), C("counter", "BIGINT", true, "0"), C("credentialType", "TEXT", true, "'public-key'"), C("authenticatorType", "TEXT", true, "'platform'"), C("deviceName", "TEXT", false, null), C("createdAt", "DATETIME", true, "CURRENT_TIMESTAMP"), C("lastUsedAt", "DATETIME", false, null)],
  WebAuthnChallenge: [C("id", "TEXT", true, null, true), C("challenge", "TEXT", true, null), C("flow", "TEXT", true, null), C("userId", "TEXT", false, null), C("browserTokenHash", "TEXT", true, null), C("expiresAt", "DATETIME", true, null), C("consumedAt", "DATETIME", false, null), C("createdAt", "DATETIME", true, "CURRENT_TIMESTAMP")],
  MemberInvitation: [C("id", "TEXT", true, null, true), C("tokenHash", "TEXT", true, null), C("targetUserId", "TEXT", true, null), C("invitedById", "TEXT", true, null), C("expiresAt", "DATETIME", true, null), C("consumedAt", "DATETIME", false, null), C("revokedAt", "DATETIME", false, null), C("createdAt", "DATETIME", true, "CURRENT_TIMESTAMP")],
  PendingTotpEnrollment: [C("id", "TEXT", true, null, true), C("userId", "TEXT", true, null), C("secretEncrypted", "TEXT", true, null), C("expiresAt", "DATETIME", true, null), C("consumedAt", "DATETIME", false, null), C("createdAt", "DATETIME", true, "CURRENT_TIMESTAMP")],
  LoginThrottle: [C("key", "TEXT", true, null, true), C("scope", "TEXT", true, null), C("failureCount", "INTEGER", true, "0"), C("windowStartedAt", "DATETIME", true, null), C("updatedAt", "DATETIME", true, null)],
};

const INDEXES: Record<string, readonly [table: string, unique: boolean, columns: readonly string[]]> = {
  User_username_key: ["User", true, ["username"]], UserTotpFactor_userId_key: ["UserTotpFactor", true, ["userId"]],
  AuthSession_sessionTokenHash_key: ["AuthSession", true, ["sessionTokenHash"]], AuthSession_userId_idx: ["AuthSession", false, ["userId"]], AuthSession_expiresAt_idx: ["AuthSession", false, ["expiresAt"]], AuthSession_trustedDeviceId_idx: ["AuthSession", false, ["trustedDeviceId"]],
  TrustedDevice_tokenHash_key: ["TrustedDevice", true, ["tokenHash"]], TrustedDevice_userId_idx: ["TrustedDevice", false, ["userId"]], TrustedDevice_expiresAt_idx: ["TrustedDevice", false, ["expiresAt"]], TrustedDevice_revokedAt_idx: ["TrustedDevice", false, ["revokedAt"]],
  WebAuthnCredential_credentialId_key: ["WebAuthnCredential", true, ["credentialId"]], WebAuthnCredential_userId_idx: ["WebAuthnCredential", false, ["userId"]],
  MemberInvitation_tokenHash_key: ["MemberInvitation", true, ["tokenHash"]], MemberInvitation_targetUserId_key: ["MemberInvitation", true, ["targetUserId"]], MemberInvitation_expiresAt_idx: ["MemberInvitation", false, ["expiresAt"]], MemberInvitation_invitedById_idx: ["MemberInvitation", false, ["invitedById"]], MemberInvitation_targetUserId_idx: ["MemberInvitation", false, ["targetUserId"]],
  PendingTotpEnrollment_userId_key: ["PendingTotpEnrollment", true, ["userId"]], PendingTotpEnrollment_expiresAt_idx: ["PendingTotpEnrollment", false, ["expiresAt"]],
  WebAuthnChallenge_browserTokenHash_flow_consumedAt_idx: ["WebAuthnChallenge", false, ["browserTokenHash", "flow", "consumedAt"]], WebAuthnChallenge_expiresAt_idx: ["WebAuthnChallenge", false, ["expiresAt"]], WebAuthnChallenge_userId_idx: ["WebAuthnChallenge", false, ["userId"]],
  LoginThrottle_updatedAt_idx: ["LoginThrottle", false, ["updatedAt"]],
};

const FOREIGN_KEYS = [
  ["AuthSession", "userId", "User", "id", "CASCADE", "CASCADE"], ["AuthSession", "trustedDeviceId", "TrustedDevice", "id", "CASCADE", "CASCADE"], ["TrustedDevice", "userId", "User", "id", "CASCADE", "CASCADE"], ["WebAuthnCredential", "userId", "User", "id", "CASCADE", "CASCADE"], ["UserTotpFactor", "userId", "User", "id", "CASCADE", "CASCADE"], ["MemberInvitation", "targetUserId", "User", "id", "RESTRICT", "CASCADE"], ["MemberInvitation", "invitedById", "User", "id", "RESTRICT", "CASCADE"], ["PendingTotpEnrollment", "userId", "User", "id", "CASCADE", "CASCADE"], ["WebAuthnChallenge", "userId", "User", "id", "CASCADE", "CASCADE"],
] as const;

export function resolveMigrationTarget(databaseUrl: string, environment: Record<string, string | undefined> = process.env) {
  if (databaseUrl.startsWith("file:")) {
    const rawPath = decodeURIComponent(databaseUrl.slice(5).split("?")[0]);
    if (!rawPath || rawPath === ":memory:") throw new Error("Family migration requires a persistent file: SQLite database");
    return { localPath: isAbsolute(rawPath) ? resolve(rawPath) : resolve(process.cwd(), rawPath) };
  }
  if (databaseUrl.startsWith("libsql:") || databaseUrl.startsWith("https:")) {
    if (environment.FAMILY_MIGRATION_EXTERNAL_SNAPSHOT_CONFIRMED !== "true") throw new Error("Remote libSQL cannot be backed up locally; create an external snapshot and set FAMILY_MIGRATION_EXTERNAL_SNAPSHOT_CONFIRMED=true");
    return { localPath: null };
  }
  throw new Error("Unsupported DATABASE_URL for family migration");
}

async function tableColumns(db: Db, table: string) { return (await db.execute(`PRAGMA table_info("${table}")`)).rows; }
async function requireColumnNames(db: Db, table: string, required: string[]) {
  const actual = new Set((await tableColumns(db, table)).map((row) => String(row.name)));
  const missing = required.filter((column) => !actual.has(column));
  if (missing.length) throw new Error(`Prerequisite structure invalid for ${table}: ${missing.length} required column(s) missing`);
}
export async function verifyFamilyMigrationPrerequisites(db: Db) {
  await requireColumnNames(db, "AuthSession", ["id", "sessionTokenHash", "expiresAt", "createdAt", "lastSeenAt"]);
  await requireColumnNames(db, "TrustedDevice", ["id", "tokenHash", "expiresAt", "createdAt"]);
  await requireColumnNames(db, "WebAuthnCredential", ["id", "credentialId", "publicKey", "counter", "createdAt"]);
  const challenge = new Set((await tableColumns(db, "WebAuthnChallenge")).map((row) => String(row.name)));
  if (challenge.size && !["id", "challenge", "expiresAt"].every((column) => challenge.has(column))) throw new Error("Prerequisite structure invalid for WebAuthnChallenge");
}
async function scalar(db: Db, sql: string) { return Number((await db.execute(sql)).rows[0]?.count ?? -1); }
function normalizedDefault(value: unknown) { return value === null || value === undefined ? null : String(value).replace(/^\(([\s\S]*)\)$/, "$1"); }
function compatibleColumnDefault(table: string, column: string, actual: string | null, expected: string | null) {
  if ((table === "User" || table === "UserTotpFactor") && column === "updatedAt" && expected === null && actual === "CURRENT_TIMESTAMP") return true;
  return actual === expected;
}
async function verifyTable(db: Db, table: string, expected: readonly ColumnSpec[]) {
  const rows = await tableColumns(db, table);
  if (rows.length !== expected.length) throw new Error(`Post-migration column verification failed: ${table}`);
  const actual = new Map(rows.map((row) => [String(row.name), row]));
  for (const [name, type, notNull, defaultValue, primaryKey] of expected) {
    const row = actual.get(name);
    if (!row || String(row.type).toUpperCase() !== type || Boolean(Number(row.notnull)) !== notNull || !compatibleColumnDefault(table, name, normalizedDefault(row.dflt_value), defaultValue) || Boolean(Number(row.pk)) !== Boolean(primaryKey)) throw new Error(`Post-migration column verification failed: ${table}.${name}`);
  }
}
async function verifyIndex(db: Db, name: string, table: string, unique: boolean, expectedColumns: readonly string[]) {
  const list = await db.execute(`PRAGMA index_list("${table}")`);
  const index = list.rows.find((row) => String(row.name) === name);
  const columns = (await db.execute(`PRAGMA index_info("${name}")`)).rows.sort((a, b) => Number(a.seqno) - Number(b.seqno)).map((row) => String(row.name));
  if (!index || Boolean(Number(index.unique)) !== unique || columns.length !== expectedColumns.length || columns.some((column, i) => column !== expectedColumns[i])) throw new Error(`Post-migration index verification failed: ${name}`);
}
async function verifyFinalStructure(db: Db) {
  for (const [table, specs] of Object.entries(TABLES)) await verifyTable(db, table, specs);
  for (const [name, [table, unique, columns]] of Object.entries(INDEXES)) await verifyIndex(db, name, table, unique, columns);
  for (const [table, from, target, to, onDelete, onUpdate] of FOREIGN_KEYS) {
    const found = (await db.execute(`PRAGMA foreign_key_list("${table}")`)).rows.some((row) => String(row.from) === from && String(row.table) === target && String(row.to) === to && String(row.on_delete).toUpperCase() === onDelete && String(row.on_update).toUpperCase() === onUpdate);
    if (!found) throw new Error(`Post-migration foreign key verification failed: ${table}.${from}`);
  }
  const foreignKeyErrors = await scalar(db, "SELECT COUNT(*) AS count FROM pragma_foreign_key_check");
  const ownershipOrphans = await scalar(db, `SELECT COUNT(*) AS count FROM (SELECT s.id FROM "AuthSession" s LEFT JOIN "User" u ON u.id=s.userId WHERE u.id IS NULL UNION ALL SELECT d.id FROM "TrustedDevice" d LEFT JOIN "User" u ON u.id=d.userId WHERE u.id IS NULL UNION ALL SELECT w.id FROM "WebAuthnCredential" w LEFT JOIN "User" u ON u.id=w.userId WHERE u.id IS NULL UNION ALL SELECT s.id FROM "AuthSession" s LEFT JOIN "TrustedDevice" d ON d.id=s.trustedDeviceId WHERE s.trustedDeviceId IS NOT NULL AND d.id IS NULL)`);
  if (foreignKeyErrors || ownershipOrphans) throw new Error("Post-migration FK/orphan verification failed");
  return { foreignKeyErrors, ownershipOrphans };
}
async function verifyPhase(db: Db, name: string) {
  if (name === "family-auth-v1") { await requireColumnNames(db, "User", ["id", "username", "updatedAt"]); await requireColumnNames(db, "AuthSession", ["userId", "authMethod"]); await requireColumnNames(db, "TrustedDevice", ["userId"]); await requireColumnNames(db, "WebAuthnCredential", ["userId"]); }
  if (name === "family-members-v1") { await requireColumnNames(db, "User", ["securityVersion", "activatedAt", "disabledAt"]); await requireColumnNames(db, "WebAuthnChallenge", ["flow", "browserTokenHash", "consumedAt"]); await requireColumnNames(db, "MemberInvitation", ["targetUserId", "invitedById"]); }
  if (name === "auth-quality-v1") await verifyFinalStructure(db);
}

function timestamp() { return new Date().toISOString().replace(/[:.]/g, "-"); }
async function createLocalBackup(client: Client, localPath: string) {
  const backupPath = `${localPath}.family-migration-${timestamp()}-${randomUUID()}.bak`;
  await client.execute(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
  const stat = await lstat(backupPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) throw new Error("Family migration backup validation failed");
  const backup = createClient({ url: pathToFileURL(backupPath).href });
  try {
    const integrity = String((await backup.execute("PRAGMA integrity_check")).rows[0]?.integrity_check ?? "");
    if (integrity.toLowerCase() !== "ok") throw new Error("Family migration backup integrity validation failed");
  } finally { backup.close(); }
  return backupPath;
}
async function beginWriteTransaction(client: Client) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await client.transaction("write"); }
    catch (error) {
      if (attempt >= 40 || !/busy|locked/i.test(error instanceof Error ? error.message : "")) throw error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25 * (attempt + 1)));
    }
  }
}
async function verifyJournalSchema(db: Db) {
  const expected = [C("phase", "TEXT", true, null, true), C("version", "INTEGER", true, null), C("checksum", "TEXT", true, null), C("status", "TEXT", true, null), C("appliedAt", "DATETIME", true, "CURRENT_TIMESTAMP")];
  try { await verifyTable(db, "FamilyMigrationJournal", expected); } catch { throw new Error("Family migration journal schema is incompatible"); }
}

const LOCAL_LOCK_STALE_MS = 30 * 60_000;

function processExists(pid: number) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error instanceof Error && "code" in error && error.code === "EPERM"; }
}

async function unlinkIfSameFile(lockPath: string, expected: { dev: bigint | number; ino: bigint | number }) {
  try {
    const current = await lstat(lockPath, { bigint: true });
    if (current.dev !== BigInt(expected.dev) || current.ino !== BigInt(expected.ino)) return false;
    await unlink(lockPath);
    return true;
  } catch { return false; }
}

async function recoverStaleLocalLock(lockPath: string, now = Date.now()) {
  try {
    const handle = await open(lockPath, "r");
    try {
      const stat = await handle.stat({ bigint: true });
      const [pidText, timestampText] = (await handle.readFile("utf8")).trim().split(/\r?\n/, 2);
      const pid = Number(pidText);
      const createdAt = Date.parse(timestampText ?? "");
      const staleByAge = Number.isFinite(createdAt) && now - createdAt > LOCAL_LOCK_STALE_MS;
      if (processExists(pid) && !staleByAge) return false;
      return unlinkIfSameFile(lockPath, stat);
    } finally { await handle.close(); }
  } catch { return false; }
}

async function acquireLocalMigrationLock(localPath: string) {
  const lockPath = `${localPath}.family-migration.lock`;
  for (let attempt = 0; attempt <= 200; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      const ownedStat = await handle.stat({ bigint: true });
      await handle.writeFile(`${process.pid}\n${new Date().toISOString()}\n`);
      return async () => {
        await handle.close();
        await unlinkIfSameFile(lockPath, ownedStat);
      };
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST") throw error;
      if (await recoverStaleLocalLock(lockPath)) continue;
      if (attempt === 200) throw new Error("Another family migration is already running");
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
    }
  }
  throw new Error("Another family migration is already running");
}

export async function applyFamilyMigrations(options: { client: Client; databaseUrl: string; backup?: boolean; environment?: Record<string, string | undefined> }) {
  const environment = options.environment ?? process.env;
  const target = resolveMigrationTarget(options.databaseUrl, environment);
  if (options.backup === false && environment.NODE_ENV !== "test") throw new Error("backup=false is only allowed when NODE_ENV=test");
  const releaseLock = target.localPath ? await acquireLocalMigrationLock(target.localPath) : async () => undefined;
  try {
    const backupPath = target.localPath && options.backup !== false ? await createLocalBackup(options.client, target.localPath) : null;
    await options.client.execute("PRAGMA foreign_keys = ON");
    const tx = await beginWriteTransaction(options.client);
    try {
      await verifyFamilyMigrationPrerequisites(tx);
      await tx.execute(JOURNAL_SQL);
      await verifyJournalSchema(tx);
      let appliedPhases = 0; let skippedPhases = 0;
      for (const current of FAMILY_MIGRATION_PHASES) {
        const existing = (await tx.execute({ sql: `SELECT "version", "checksum", "status" FROM "FamilyMigrationJournal" WHERE "phase" = ?`, args: [current.name] })).rows[0];
        if (existing) {
          if (Number(existing.version) !== current.version || String(existing.checksum) !== current.checksum || String(existing.status) !== "applied") throw new Error(`Family migration journal mismatch: ${current.name}`);
          await verifyPhase(tx, current.name);
          skippedPhases += 1;
        } else {
          await current.apply(options.client, tx, environment);
          await verifyPhase(tx, current.name);
          await tx.execute({ sql: `INSERT INTO "FamilyMigrationJournal" ("phase", "version", "checksum", "status") VALUES (?, ?, ?, 'applied')`, args: [current.name, current.version, current.checksum] });
          appliedPhases += 1;
        }
      }
      const verification = await verifyFinalStructure(tx);
      await tx.commit();
      return { appliedPhases, skippedPhases, backupCreated: backupPath ? 1 : 0, backupPath, ...verification };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  } finally {
    await releaseLock();
  }
}

async function main() {
  loadEnvConfig(process.cwd());
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Missing DATABASE_URL");
  const client = createClient({ url: databaseUrl });
  try {
    const result = await applyFamilyMigrations({ client, databaseUrl });
    console.log(JSON.stringify({ appliedPhases: result.appliedPhases, skippedPhases: result.skippedPhases, backupCreated: result.backupCreated, foreignKeyErrors: result.foreignKeyErrors, ownershipOrphans: result.ownershipOrphans }));
  } finally { client.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Family migration failed"); process.exitCode = 1; });
