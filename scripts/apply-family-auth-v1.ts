import { type Client, type Transaction } from "@libsql/client";

export const FAMILY_AUTH_MIGRATION_ARTIFACT_URL = import.meta.url;
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
  "updatedAt" DATETIME NOT NULL
)`;

const TOTP_TABLE_SQL = `CREATE TABLE IF NOT EXISTS "UserTotpFactor" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "secretEncrypted" TEXT NOT NULL,
  "enabledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "UserTotpFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`;

function rebuildAuthSession(columns: Set<string>) {
  const userId = columns.has("userId") ? '"userId"' : `'${LEGACY_ADMIN_ID}'`;
  const authMethod = columns.has("authMethod") ? '"authMethod"' : "'legacy'";
  return [
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
   SELECT "id", ${userId}, ${authMethod}, "sessionTokenHash", "expiresAt", "ipAddress", "userAgent", "createdAt", "lastSeenAt" FROM "AuthSession"`,
  'DROP TABLE "AuthSession"',
  'ALTER TABLE "new_AuthSession" RENAME TO "AuthSession"',
  ];
}

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

const REBUILD_ALLOWED_COLUMNS: Record<keyof AuthTableColumns, ReadonlySet<string>> = {
  AuthSession: new Set(["id", "userId", "authMethod", "sessionTokenHash", "expiresAt", "ipAddress", "userAgent", "createdAt", "lastSeenAt"]),
  TrustedDevice: new Set(["id", "userId", "tokenHash", "deviceName", "userAgent", "ipAddress", "expiresAt", "lastUsedAt", "revokedAt", "createdAt"]),
  WebAuthnCredential: new Set(["id", "userId", "credentialId", "publicKey", "counter", "credentialType", "authenticatorType", "deviceName", "createdAt", "lastUsedAt"]),
};

function rejectUnexpectedRebuildColumns(table: keyof AuthTableColumns, columns: Set<string>) {
  const unexpected = [...columns].filter((column) => !REBUILD_ALLOWED_COLUMNS[table].has(column));
  if (unexpected.length) throw new Error(`Unexpected column(s) in ${table}; migration refused to prevent data loss`);
}

export function buildFamilyAuthMigrationPlan(columns: AuthTableColumns) {
  if (!columns.AuthSession.has("userId") || !columns.AuthSession.has("authMethod")) {
    rejectUnexpectedRebuildColumns("AuthSession", columns.AuthSession);
  }
  if (!columns.TrustedDevice.has("userId")) rejectUnexpectedRebuildColumns("TrustedDevice", columns.TrustedDevice);
  if (!columns.WebAuthnCredential.has("userId")) rejectUnexpectedRebuildColumns("WebAuthnCredential", columns.WebAuthnCredential);

  const plan = [
    USER_TABLE_SQL,
    'CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username")',
    `INSERT OR IGNORE INTO "User" ("id", "username", "displayName", "role", "status", "createdAt", "updatedAt") VALUES ('${LEGACY_ADMIN_ID}', 'admin', '管理员', 'ADMIN', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    TOTP_TABLE_SQL,
    'CREATE UNIQUE INDEX IF NOT EXISTS "UserTotpFactor_userId_key" ON "UserTotpFactor"("userId")',
  ];

  if (!columns.AuthSession.has("userId") || !columns.AuthSession.has("authMethod")) plan.push(...rebuildAuthSession(columns.AuthSession));
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

type MigrationDb = Client | Transaction;

async function getColumns(client: MigrationDb, table: keyof AuthTableColumns) {
  const result = await client.execute(`PRAGMA table_info("${table}")`);
  return new Set(result.rows.map((row) => String(row.name)));
}

async function count(db: MigrationDb, sql: string) {
  const result = await db.execute(sql);
  return Number(result.rows[0]?.count ?? -1);
}

export type LegacyAdminMigrationEnvironment = Record<string, string | undefined>;

function legacyAdminIdentity(environment: LegacyAdminMigrationEnvironment) {
  const username = (environment.LEGACY_ADMIN_USERNAME ?? "admin").trim().toLowerCase();
  const displayName = (environment.LEGACY_ADMIN_DISPLAY_NAME ?? "管理员").trim();
  if (!username || !displayName) throw new Error("Legacy admin identity is invalid");
  return { username, displayName };
}

async function migrateLegacyAdminIdentityAndTotp(tx: MigrationDb, environment: LegacyAdminMigrationEnvironment) {
  const identity = legacyAdminIdentity(environment);
  await tx.execute({
    sql: `UPDATE "User" SET "username" = ?, "displayName" = ? WHERE "id" = ?`,
    args: [identity.username, identity.displayName, LEGACY_ADMIN_ID],
  });

  const appSettingExists = await count(tx, `SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name = 'AppSetting'`);
  if (!appSettingExists) return;
  const appSettingColumns = new Set((await tx.execute(`PRAGMA table_info("AppSetting")`)).rows.map((row) => String(row.name)));
  if (!appSettingColumns.has("otpSecretEncrypted")) throw new Error("Prerequisite structure invalid for AppSetting.otpSecretEncrypted");

  const source = (await tx.execute(`SELECT "otpSecretEncrypted" FROM "AppSetting" WHERE "id" = 1`)).rows[0]?.otpSecretEncrypted;
  if (source === null || source === undefined || String(source).length === 0) return;
  await tx.execute({
    sql: `INSERT OR IGNORE INTO "UserTotpFactor" ("id", "userId", "secretEncrypted", "enabledAt", "createdAt", "updatedAt") VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    args: [`${LEGACY_ADMIN_ID}-totp`, LEGACY_ADMIN_ID, String(source)],
  });
  const usableFactor = await count(tx, `SELECT COUNT(*) AS count FROM "UserTotpFactor" WHERE "userId" = '${LEGACY_ADMIN_ID}' AND "revokedAt" IS NULL`);
  if (usableFactor !== 1) throw new Error("Legacy admin TOTP continuity verification failed");
}

export async function applyFamilyAuthMigration(client: Client, existingTx?: Transaction, environment: LegacyAdminMigrationEnvironment = process.env) {
  const db: MigrationDb = existingTx ?? client;
  const before = {
    sessions: await count(db, 'SELECT COUNT(*) AS count FROM "AuthSession"'),
    devices: await count(db, 'SELECT COUNT(*) AS count FROM "TrustedDevice"'),
    credentials: await count(db, 'SELECT COUNT(*) AS count FROM "WebAuthnCredential"'),
  };
  const columns: AuthTableColumns = {
    AuthSession: await getColumns(db, "AuthSession"),
    TrustedDevice: await getColumns(db, "TrustedDevice"),
    WebAuthnCredential: await getColumns(db, "WebAuthnCredential"),
  };
  const plan = buildFamilyAuthMigrationPlan(columns);
  const tx = existingTx ?? await client.transaction("write");
  try {
    for (const sql of plan) await tx.execute(sql);
    await migrateLegacyAdminIdentityAndTotp(tx, environment);
    const after = {
      sessions: await count(tx, 'SELECT COUNT(*) AS count FROM "AuthSession"'),
      devices: await count(tx, 'SELECT COUNT(*) AS count FROM "TrustedDevice"'),
      credentials: await count(tx, 'SELECT COUNT(*) AS count FROM "WebAuthnCredential"'),
    };
    const legacyAdmin = await count(tx, `SELECT COUNT(*) AS count FROM "User" WHERE "id" = '${LEGACY_ADMIN_ID}'`);
    const nullOwnershipRows = [
      await count(tx, 'SELECT COUNT(*) AS count FROM "AuthSession" WHERE "userId" IS NULL'),
      await count(tx, 'SELECT COUNT(*) AS count FROM "TrustedDevice" WHERE "userId" IS NULL'),
      await count(tx, 'SELECT COUNT(*) AS count FROM "WebAuthnCredential" WHERE "userId" IS NULL'),
    ];
    const foreignKeyErrors = await count(tx, "SELECT COUNT(*) AS count FROM pragma_foreign_key_check");
    if (legacyAdmin !== 1 || nullOwnershipRows.some((value) => value !== 0) || foreignKeyErrors !== 0 || JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error("Family auth migration verification failed");
    }
    if (!existingTx) await tx.commit();
    return { statements: plan.length, legacyAdmin, nullOwnershipRows, preservedRows: after, foreignKeyErrors };
  } catch (error) {
    if (!existingTx) await tx.rollback();
    throw error;
  }
}
