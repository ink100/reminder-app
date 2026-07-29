import { type Client, type Transaction } from "@libsql/client";

export const AUTH_QUALITY_MIGRATION_ARTIFACT_URL = import.meta.url;
export type AuthQualityColumns = { AuthSession: Set<string>; TrustedDevice: Set<string>; LoginThrottle: Set<string> };

const THROTTLE_SQL = `CREATE TABLE IF NOT EXISTS "LoginThrottle" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "scope" TEXT NOT NULL,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL
)`;

const REQUIRED_SESSION_COLUMNS = [
  "id", "userId", "authMethod", "securityVersion", "sessionTokenHash", "expiresAt",
  "ipAddress", "userAgent", "trustedDeviceId", "createdAt", "lastSeenAt",
];

export function buildAuthQualityMigrationPlan(columns: AuthQualityColumns) {
  const plan: string[] = [];
  if (!columns.AuthSession.has("securityVersion")) {
    plan.push(
      'ALTER TABLE "AuthSession" ADD COLUMN "securityVersion" INTEGER NOT NULL DEFAULT 0',
      'UPDATE "AuthSession" SET "securityVersion" = (SELECT "securityVersion" FROM "User" WHERE "User"."id" = "AuthSession"."userId")',
    );
  }
  if (!columns.AuthSession.has("trustedDeviceId")) {
    plan.push('ALTER TABLE "AuthSession" ADD COLUMN "trustedDeviceId" TEXT REFERENCES "TrustedDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE');
  }
  if (!columns.TrustedDevice.has("securityVersion")) {
    plan.push(
      'ALTER TABLE "TrustedDevice" ADD COLUMN "securityVersion" INTEGER NOT NULL DEFAULT 0',
      'UPDATE "TrustedDevice" SET "securityVersion" = (SELECT "securityVersion" FROM "User" WHERE "User"."id" = "TrustedDevice"."userId")',
    );
  }
  plan.push(
    THROTTLE_SQL,
    'CREATE INDEX IF NOT EXISTS "LoginThrottle_updatedAt_idx" ON "LoginThrottle"("updatedAt")',
    'CREATE UNIQUE INDEX IF NOT EXISTS "AuthSession_sessionTokenHash_key" ON "AuthSession"("sessionTokenHash")',
    'CREATE INDEX IF NOT EXISTS "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt")',
    'CREATE INDEX IF NOT EXISTS "AuthSession_userId_idx" ON "AuthSession"("userId")',
    'CREATE INDEX IF NOT EXISTS "AuthSession_trustedDeviceId_idx" ON "AuthSession"("trustedDeviceId")',
  );
  return plan;
}

async function columns(db: Client | Transaction, table: string) {
  const result = await db.execute(`PRAGMA table_info("${table}")`);
  return new Set(result.rows.map((row) => String(row.name)));
}

async function count(db: Client | Transaction, sql: string) {
  const result = await db.execute(sql);
  return Number(result.rows[0]?.count ?? -1);
}

async function hasTrustedDeviceCascade(db: Client | Transaction) {
  const result = await db.execute('PRAGMA foreign_key_list("AuthSession")');
  return result.rows.some((row) =>
    String(row.from) === "trustedDeviceId"
    && String(row.table) === "TrustedDevice"
    && String(row.to) === "id"
    && String(row.on_delete).toUpperCase() === "CASCADE",
  );
}

async function rebuildAuthSession(tx: Transaction) {
  const existing = await columns(tx, "AuthSession");
  const unexpected = [...existing].filter((name) => !REQUIRED_SESSION_COLUMNS.includes(name));
  const missing = REQUIRED_SESSION_COLUMNS.filter((name) => !existing.has(name));
  if (unexpected.length || missing.length) {
    throw new Error(`AuthSession cannot be safely rebuilt: unexpected=${unexpected.length}, missing=${missing.length}`);
  }
  await tx.execute(`CREATE TABLE "new_AuthSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "authMethod" TEXT NOT NULL,
    "securityVersion" INTEGER NOT NULL DEFAULT 0,
    "sessionTokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "trustedDeviceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuthSession_trustedDeviceId_fkey" FOREIGN KEY ("trustedDeviceId") REFERENCES "TrustedDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`);
  await tx.execute(`INSERT INTO "new_AuthSession" (${REQUIRED_SESSION_COLUMNS.map((name) => `"${name}"`).join(", ")})
    SELECT ${REQUIRED_SESSION_COLUMNS.map((name) => `"${name}"`).join(", ")} FROM "AuthSession"`);
  await tx.execute('DROP TABLE "AuthSession"');
  await tx.execute('ALTER TABLE "new_AuthSession" RENAME TO "AuthSession"');
  await tx.execute('CREATE UNIQUE INDEX "AuthSession_sessionTokenHash_key" ON "AuthSession"("sessionTokenHash")');
  await tx.execute('CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt")');
  await tx.execute('CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId")');
  await tx.execute('CREATE INDEX "AuthSession_trustedDeviceId_idx" ON "AuthSession"("trustedDeviceId")');
}

async function verifyIndex(db: Client | Transaction, table: string, name: string, unique: boolean) {
  const indexes = await db.execute(`PRAGMA index_list("${table}")`);
  return indexes.rows.some((row) => String(row.name) === name && Boolean(Number(row.unique)) === unique);
}

export async function applyAuthQualityMigration(client: Client, existingTx?: Transaction) {
  if (!existingTx) await client.execute("PRAGMA foreign_keys = ON");
  const db: Client | Transaction = existingTx ?? client;
  const before = {
    sessions: await count(db, 'SELECT COUNT(*) AS count FROM "AuthSession"'),
    devices: await count(db, 'SELECT COUNT(*) AS count FROM "TrustedDevice"'),
  };
  const existingColumns = {
    AuthSession: await columns(db, "AuthSession"),
    TrustedDevice: await columns(db, "TrustedDevice"),
    LoginThrottle: await columns(db, "LoginThrottle"),
  };
  const plan = buildAuthQualityMigrationPlan(existingColumns);
  const tx = existingTx ?? await client.transaction("write");
  try {
    for (const sql of plan) await tx.execute(sql);
    if (!(await hasTrustedDeviceCascade(tx))) await rebuildAuthSession(tx);

    const after = {
      sessions: await count(tx, 'SELECT COUNT(*) AS count FROM "AuthSession"'),
      devices: await count(tx, 'SELECT COUNT(*) AS count FROM "TrustedDevice"'),
    };
    const snapshotChecks: string[] = [];
    if (!existingColumns.AuthSession.has("securityVersion")) snapshotChecks.push('SELECT s."id" FROM "AuthSession" s JOIN "User" u ON u."id" = s."userId" WHERE s."securityVersion" != u."securityVersion"');
    if (!existingColumns.TrustedDevice.has("securityVersion")) snapshotChecks.push('SELECT d."id" FROM "TrustedDevice" d JOIN "User" u ON u."id" = d."userId" WHERE d."securityVersion" != u."securityVersion"');
    const missingSnapshots = snapshotChecks.length ? await count(tx, `SELECT COUNT(*) AS count FROM (${snapshotChecks.join(" UNION ALL ")})`) : 0;
    const foreignKeyErrors = await count(tx, "SELECT COUNT(*) AS count FROM pragma_foreign_key_check");
    const orphanTrustedDevices = await count(tx, 'SELECT COUNT(*) AS count FROM "AuthSession" s LEFT JOIN "TrustedDevice" d ON d."id" = s."trustedDeviceId" WHERE s."trustedDeviceId" IS NOT NULL AND d."id" IS NULL');
    const finalColumns = await columns(tx, "AuthSession");
    const targetColumnsPresent = REQUIRED_SESSION_COLUMNS.every((name) => finalColumns.has(name));
    const indexesValid = await verifyIndex(tx, "AuthSession", "AuthSession_sessionTokenHash_key", true)
      && await verifyIndex(tx, "AuthSession", "AuthSession_expiresAt_idx", false)
      && await verifyIndex(tx, "AuthSession", "AuthSession_userId_idx", false)
      && await verifyIndex(tx, "AuthSession", "AuthSession_trustedDeviceId_idx", false)
      && await verifyIndex(tx, "LoginThrottle", "LoginThrottle_updatedAt_idx", false);
    if (before.sessions !== after.sessions || before.devices !== after.devices || missingSnapshots || foreignKeyErrors || orphanTrustedDevices || !targetColumnsPresent || !indexesValid || !(await hasTrustedDeviceCascade(tx))) {
      throw new Error("Auth quality migration verification failed");
    }
    if (!existingTx) await tx.commit();
    return { statements: plan.length, preservedSessions: after.sessions, preservedDevices: after.devices, missingSnapshots, orphanTrustedDevices, foreignKeyErrors };
  } catch (error) {
    if (!existingTx) await tx.rollback();
    throw error;
  }
}
