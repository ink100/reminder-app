import { type Client, type Transaction } from "@libsql/client";

export const FAMILY_MEMBERS_MIGRATION_ARTIFACT_URL = import.meta.url;
export type FamilyMembersColumns = { User: Set<string>; UserTotpFactor?: Set<string>; WebAuthnChallenge: Set<string> };

const INVITATION_SQL = `CREATE TABLE IF NOT EXISTS "MemberInvitation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tokenHash" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "consumedAt" DATETIME,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MemberInvitation_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MemberInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
)`;

const PENDING_TOTP_SQL = `CREATE TABLE IF NOT EXISTS "PendingTotpEnrollment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "secretEncrypted" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "consumedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PendingTotpEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`;

const CHALLENGE_SQL = `CREATE TABLE IF NOT EXISTS "WebAuthnChallenge" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "challenge" TEXT NOT NULL,
  "flow" TEXT NOT NULL,
  "userId" TEXT,
  "browserTokenHash" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "consumedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebAuthnChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`;

export function buildFamilyMembersMigrationPlan(columns: FamilyMembersColumns) {
  const plan: string[] = [];
  if (!columns.User.has("securityVersion")) plan.push('ALTER TABLE "User" ADD COLUMN "securityVersion" INTEGER NOT NULL DEFAULT 0');
  if (!columns.User.has("activatedAt")) plan.push('ALTER TABLE "User" ADD COLUMN "activatedAt" DATETIME');
  if (!columns.User.has("disabledAt")) plan.push('ALTER TABLE "User" ADD COLUMN "disabledAt" DATETIME');
  if (columns.UserTotpFactor && !columns.UserTotpFactor.has("lastAcceptedStep")) plan.push('ALTER TABLE "UserTotpFactor" ADD COLUMN "lastAcceptedStep" INTEGER');
  plan.push(INVITATION_SQL, PENDING_TOTP_SQL);

  const oldChallenge = columns.WebAuthnChallenge.size > 0 && !columns.WebAuthnChallenge.has("flow");
  if (oldChallenge) {
    const supportedLegacyColumns = new Set(["id", "challenge", "expiresAt"]);
    const unexpected = [...columns.WebAuthnChallenge].filter((column) => !supportedLegacyColumns.has(column));
    if (unexpected.length) throw new Error("Unexpected column(s) in WebAuthnChallenge; migration refused to prevent data loss");
  }
  if (oldChallenge) plan.push(
    `CREATE TABLE "WebAuthnChallengeLegacyArchive" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "challenge" TEXT NOT NULL,
      "expiresAt" DATETIME NOT NULL,
      "archivedAt" DATETIME NOT NULL,
      "usableForAuthentication" INTEGER NOT NULL
    )`,
    `INSERT INTO "WebAuthnChallengeLegacyArchive" ("id", "challenge", "expiresAt", "archivedAt", "usableForAuthentication")
     SELECT "id", "challenge", "expiresAt", CURRENT_TIMESTAMP, 0 FROM "WebAuthnChallenge"`,
    'DROP TABLE "WebAuthnChallenge"',
  );
  if (oldChallenge || columns.WebAuthnChallenge.size === 0) plan.push(CHALLENGE_SQL);

  plan.push(
    'CREATE UNIQUE INDEX IF NOT EXISTS "MemberInvitation_tokenHash_key" ON "MemberInvitation"("tokenHash")',
    'CREATE UNIQUE INDEX IF NOT EXISTS "MemberInvitation_targetUserId_key" ON "MemberInvitation"("targetUserId")',
    'CREATE INDEX IF NOT EXISTS "MemberInvitation_expiresAt_idx" ON "MemberInvitation"("expiresAt")',
    'CREATE INDEX IF NOT EXISTS "MemberInvitation_invitedById_idx" ON "MemberInvitation"("invitedById")',
    'CREATE INDEX IF NOT EXISTS "MemberInvitation_targetUserId_idx" ON "MemberInvitation"("targetUserId")',
    'CREATE UNIQUE INDEX IF NOT EXISTS "PendingTotpEnrollment_userId_key" ON "PendingTotpEnrollment"("userId")',
    'CREATE INDEX IF NOT EXISTS "PendingTotpEnrollment_expiresAt_idx" ON "PendingTotpEnrollment"("expiresAt")',
    'CREATE INDEX IF NOT EXISTS "WebAuthnChallenge_browserTokenHash_flow_consumedAt_idx" ON "WebAuthnChallenge"("browserTokenHash", "flow", "consumedAt")',
    'CREATE INDEX IF NOT EXISTS "WebAuthnChallenge_expiresAt_idx" ON "WebAuthnChallenge"("expiresAt")',
    'CREATE INDEX IF NOT EXISTS "WebAuthnChallenge_userId_idx" ON "WebAuthnChallenge"("userId")',
  );
  return plan;
}

type MigrationDb = Client | Transaction;

async function columns(client: MigrationDb, table: string) {
  const result = await client.execute(`PRAGMA table_info("${table}")`);
  return new Set(result.rows.map((row) => String(row.name)));
}

async function count(db: MigrationDb, sql: string) {
  const result = await db.execute(sql);
  return Number(result.rows[0]?.count ?? -1);
}

export async function applyFamilyMembersMigration(client: Client, existingTx?: Transaction) {
  if (!existingTx) await client.execute("PRAGMA foreign_keys = ON");
  const db: MigrationDb = existingTx ?? client;
  const beforeUsers = await count(db, 'SELECT COUNT(*) AS count FROM "User"');
  const unknownStatuses = await count(db, `SELECT COUNT(*) AS count FROM "User" WHERE "status" NOT IN ('INVITED', 'ACTIVE', 'DISABLED') OR "status" IS NULL`);
  if (unknownStatuses !== 0) throw new Error(`Unknown user status detected (${unknownStatuses} row(s)); migration refused`);
  const challengeColumns = await columns(db, "WebAuthnChallenge");
  const oldChallenge = challengeColumns.size > 0 && !challengeColumns.has("flow");
  const beforeLegacyChallenges = oldChallenge ? await count(db, 'SELECT COUNT(*) AS count FROM "WebAuthnChallenge"') : 0;
  const plan = buildFamilyMembersMigrationPlan({ User: await columns(db, "User"), UserTotpFactor: await columns(db, "UserTotpFactor"), WebAuthnChallenge: challengeColumns });
  const tx = existingTx ?? await client.transaction("write");
  try {
    for (const sql of plan) await tx.execute(sql);
    const afterUsers = await count(tx, 'SELECT COUNT(*) AS count FROM "User"');
    const legacyAdmin = await count(tx, 'SELECT COUNT(*) AS count FROM "User" WHERE "id" = \'legacy-admin\' AND "role" = \'ADMIN\'');
    const foreignKeyErrors = await count(tx, "SELECT COUNT(*) AS count FROM pragma_foreign_key_check");
    const archivedLegacyChallenges = oldChallenge ? await count(tx, 'SELECT COUNT(*) AS count FROM "WebAuthnChallengeLegacyArchive" WHERE "usableForAuthentication" = 0') : 0;
    const activeLegacyChallenges = oldChallenge ? await count(tx, 'SELECT COUNT(*) AS count FROM "WebAuthnChallenge"') : 0;
    const archiveFieldErrors = oldChallenge ? await count(tx, `SELECT COUNT(*) AS count FROM "WebAuthnChallengeLegacyArchive" WHERE "id" IS NULL OR "challenge" IS NULL OR "expiresAt" IS NULL OR "archivedAt" IS NULL OR "usableForAuthentication" != 0`) : 0;
    if (beforeUsers !== afterUsers || legacyAdmin !== 1 || foreignKeyErrors !== 0 || archivedLegacyChallenges !== beforeLegacyChallenges || activeLegacyChallenges !== 0 || archiveFieldErrors !== 0) {
      throw new Error("Family members migration verification failed");
    }
    if (!existingTx) await tx.commit();
    return { statements: plan.length, preservedUsers: afterUsers, archivedLegacyChallenges, legacyAdmin, foreignKeyErrors };
  } catch (error) {
    if (!existingTx) await tx.rollback();
    throw error;
  }
}
