import { createClient, type Client, type Transaction } from "@libsql/client";
import { loadEnvConfig } from "@next/env";
import { pathToFileURL } from "node:url";

export const LEGACY_ADMIN_ID = "legacy-admin";

type AuthTableColumns = {
  AuthSession: Set<string>;
  TrustedDevice: Set<string>;
  WebAuthnCredential: Set<string>;
};

const USER_TABLE_SQL = `CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "username" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',

  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

const TOTP_TABLE_SQL = `CREATE TABLE IF NOT EXISTS "UserTotpFactor" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "secretEncrypted" TEXT NOT NULL,
  "enabledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserTotpFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`;

const REBUILD_AUTH_SESSION = [
  `CREATE TABLE "new_AuthSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "authMethod" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `INSERT INTO "new_AuthSession" ("id", "userId", "authMethod", "sessionTokenHash", "expiresAt", "ipAddress", "userAgent", "createdAt", "lastSeenAt")
   SELECT "id", '${LEGACY_ADMIN_ID}', 'legacy', "sessionTokenHash", "expiresAt", "ipAddress", "userAgent", "createdAt", "lastSeenAt" FROM "AuthSession"`,
  'DROP TABLE "AuthSession"',
  'ALTER TABLE "new_AuthSession" RENAME TO "AuthSession"',
];

const REBUILD_TRUSTED_DEVICE = [
  `CREATE TABLE "new_TrustedDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceName" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "lastUsedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `INSERT INTO "new_TrustedDevice" ("id", "userId", "tokenHash", "deviceName", "userAgent", "ipAddress", "expiresAt", "lastUsedAt", "revokedAt", "createdAt")
   SELECT "id", '${LEGACY_ADMIN_ID}', "tokenHash", "deviceName", "userAgent", "ipAddress", "expiresAt", "lastUsedAt", "revokedAt", "createdAt" FROM "TrustedDevice"`,
  'DROP TABLE "TrustedDevice"',
  'ALTER TABLE "new_TrustedDevice" RENAME TO "TrustedDevice"',
];

const REBUILD_WEBAUTHN = [
  `CREATE TABLE "new_WebAuthnCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "credentialType" TEXT NOT NULL DEFAULT 'public-key',
    "authenticatorType" TEXT NOT NULL DEFAULT 'platform',
    "deviceName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME,
    CONSTRAINT "WebAuthnCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `INSERT INTO "new_WebAuthnCredential" ("id", "userId", "credentialId", "publicKey", "counter", "credentialType", "authenticatorType", "deviceName", "createdAt", "lastUsedAt")
   SELECT "id", '${LEGACY_ADMIN_ID}', "credentialId", "publicKey", "counter", "credentialType", "authenticatorType", "deviceName", "createdAt", "lastUsedAt" FROM "WebAuthnCredential"`,
  'DROP TABLE "WebAuthnCredential"',
  'ALTER TABLE "new_WebAuthnCredential" RENAME TO "WebAuthnCredential"',
];

export function buildFamilyAuthMigrationPlan(columns: AuthTableColumns) {
  const plan = [
    USER_TABLE_SQL,
    'CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username")',
    `INSERT OR IGNORE INTO "User" ("id", "username", "displayName", "role", "status") VALUES ('${LEGACY_ADMIN_ID}', 'admin', '管理员', 'ADMIN', 'ACTIVE')`,
    TOTP_TABLE_SQL,
    'CREATE UNIQUE INDEX IF NOT EXISTS "UserTotpFactor_userId_key" ON "UserTotpFactor"("userId")',
  ];

  if (!columns.AuthSession.has("userId") || !columns.AuthSession.has("authMethod")) plan.push(...REBUILD_AUTH_SESSION);
  if (!columns.TrustedDevice.has("userId")) plan.push(...REBUILD_TRUSTED_DEVICE);
  if (!columns.WebAuthnCredential.has("userId")) plan.push(...REBUILD_WEBAUTHN);

  plan.push(
    'CREATE UNIQUE INDEX IF NOT EXISTS "AuthSession_sessionTokenHash_key" ON "AuthSession"("sessionTokenHash")',
    'CREATE INDEX IF NOT EXISTS "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt")',
    'CREATE INDEX IF NOT EXISTS "AuthSession_userId_idx" ON "AuthSession"("userId")',
    'CREATE UNIQUE INDEX IF NOT EXISTS "TrustedDevice_tokenHash_key" ON "TrustedDevice"("tokenHash")',
    'CREATE INDEX IF NOT EXISTS "TrustedDevice_expiresAt_idx" ON "TrustedDevice"("expiresAt")',
    'CREATE INDEX IF NOT EXISTS "TrustedDevice_revokedAt_idx" ON "TrustedDevice"("revokedAt")',
    'CREATE INDEX IF NOT EXISTS "TrustedDevice_userId_idx" ON "TrustedDevice"("userId")',
    'CREATE UNIQUE INDEX IF NOT EXISTS "WebAuthnCredential_credentialId_key" ON "WebAuthnCredential"("credentialId")',
    'CREATE INDEX IF NOT EXISTS "WebAuthnCredential_userId_idx" ON "WebAuthnCredential"("userId")',
  );
  return plan;
}

async function getColumns(client: Client, table: keyof AuthTableColumns) {
  const result = await client.execute(`PRAGMA table_info("${table}")`);
  return new Set(result.rows.map((row) => String(row.name)));
}

async function count(tx: Transaction, sql: string) {
  const result = await tx.execute(sql);
  return Number(result.rows[0]?.count ?? -1);
}

export async function applyFamilyAuthMigration(client: Client) {
  const before = {
    sessions: Number((await client.execute('SELECT COUNT(*) AS count FROM "AuthSession"')).rows[0]?.count ?? -1),
    devices: Number((await client.execute('SELECT COUNT(*) AS count FROM "TrustedDevice"')).rows[0]?.count ?? -1),
    credentials: Number((await client.execute('SELECT COUNT(*) AS count FROM "WebAuthnCredential"')).rows[0]?.count ?? -1),
  };
  const columns: AuthTableColumns = {
    AuthSession: await getColumns(client, "AuthSession"),
    TrustedDevice: await getColumns(client, "TrustedDevice"),
    WebAuthnCredential: await getColumns(client, "WebAuthnCredential"),
  };
  const plan = buildFamilyAuthMigrationPlan(columns);
  const tx = await client.transaction("write");
  try {
    for (const sql of plan) await tx.execute(sql);
    const after = {
      sessions: await count(tx, 'SELECT COUNT(*) AS count FROM "AuthSession"'),
      devices: await count(tx, 'SELECT COUNT(*) AS count FROM "TrustedDevice"'),
      credentials: await count(tx, 'SELECT COUNT(*) AS count FROM "WebAuthnCredential"'),
    };
    const legacyAdmin = await count(tx, `SELECT COUNT(*) AS count FROM "User" WHERE "id" = '${LEGACY_ADMIN_ID}'`);
    const nullOwnershipRows = await Promise.all([
      count(tx, 'SELECT COUNT(*) AS count FROM "AuthSession" WHERE "userId" IS NULL'),
      count(tx, 'SELECT COUNT(*) AS count FROM "TrustedDevice" WHERE "userId" IS NULL'),
      count(tx, 'SELECT COUNT(*) AS count FROM "WebAuthnCredential" WHERE "userId" IS NULL'),
    ]);
    const foreignKeyErrors = await count(tx, "SELECT COUNT(*) AS count FROM pragma_foreign_key_check");
    if (legacyAdmin !== 1 || nullOwnershipRows.some((value) => value !== 0) || foreignKeyErrors !== 0 || JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error("Family auth migration verification failed");
    }
    await tx.commit();
    return { statements: plan.length, legacyAdmin, nullOwnershipRows, preservedRows: after, foreignKeyErrors };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

async function main() {
  loadEnvConfig(process.cwd());
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL");
  const client = createClient({ url });
  try {
    const result = await applyFamilyAuthMigration(client);
    const { ensureLegacyAdmin } = await import("@/lib/legacy-admin");
    await ensureLegacyAdmin();
    console.log(JSON.stringify(result));
  } finally {
    client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Family auth migration failed");
    process.exitCode = 1;
  });
}
