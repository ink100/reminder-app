# Family multi-user manual migration

## Why this is a validated manual migration

The checked-in Prisma migration history cannot currently be replayed from zero. In particular, `prisma migrate diff --from-migrations` reaches `20260718021500_add_store_account_payment_qr_ownership` before the `Attachment` table exists and fails with Prisma error **P3006**.

Therefore this upgrade is intentionally performed by the validated manual runner below. **Do not claim or assume that `prisma migrate deploy` can perform this family multi-user upgrade.** Repairing the historical migration chain is a separate project and is not part of this procedure.

## Approved command

```bash
npm run db:family-migrate
```

Do not run the three phase scripts independently in an operational upgrade. The runner enforces this order:

1. `family-auth-v1`
2. `family-members-v1`
3. `auth-quality-v1`

It validates prerequisite legacy structures before writing, records applied phases in `FamilyMigrationJournal`, verifies the final columns, foreign keys, unique and ordinary indexes, zero orphans, and retained row counts, and prints only non-sensitive counts. During `family-auth-v1`, the configured legacy-admin username/display name and any `AppSetting.otpSecretEncrypted` ciphertext are transferred inside the same outer transaction without decrypting or logging the secret; a usable non-revoked owner TOTP factor is verified before commit. The runner also narrowly accepts the immediately preceding supported family-auth schema where `User.updatedAt` and `UserTotpFactor.updatedAt` use `DEFAULT CURRENT_TIMESTAMP`; other structural drift still fails closed.

## Snapshot requirements

- For `file:` SQLite URLs, the runner creates a consistent timestamped `VACUUM INTO` backup next to the database before creating the journal or changing schema, then forces the backup mode to owner-only `0600`. Retain that `.bak` file until application verification is complete.
- For remote libSQL/HTTP URLs, the runner cannot make a local database backup and fails closed. Create and verify an external provider snapshot first, then explicitly set:

```bash
export FAMILY_MIGRATION_EXTERNAL_SNAPSHOT_CONFIRMED=true
npm run db:family-migrate
```

The confirmation is an operator assertion; the script does not pretend it created or validated a provider-side snapshot.

## Legacy WebAuthn challenges

The legacy fixed/unscoped `WebAuthnChallenge` rows are copied transactionally, with count verification, into `WebAuthnChallengeLegacyArchive` before the old table is replaced. Archived rows have `usableForAuthentication = 0`. They are retained only for audit/forensics and **must never be read or reused by new authentication ceremonies**. New authentication uses only the replacement `WebAuthnChallenge` table with flow, browser-token binding, consumption, expiry, and optional user ownership.

## Failure, locking, and rerun behavior

The unified runner opens one outer write transaction covering all three phases, every phase verification, all journal inserts, and final structure verification. Any failure rolls back the complete family migration, including journal creation/updates. On rerun, completed journal entries are skipped only when phase name, version, status, and checksum all match; final structure is still verified. Each phase checksum is SHA-256 over the bytes of the actual loaded phase module, so any SQL, schema, data-transform, or control-flow change mechanically changes the checksum and an old journal entry fails closed. Rebuilt legacy auth tables reject unknown source columns before any schema write, preventing silent data loss. Unknown `User.status` values also fail closed; the migration never rewrites them to `ACTIVE`.

For local SQLite, the runner writes PID and creation timestamp into an exclusive sidecar lock. It never steals a live lock younger than the explicit 30-minute safety threshold. A lock is recovered only when its PID no longer exists or it exceeds 30 minutes; inode comparison precedes atomic unlink/retry so a replaced lock is not knowingly removed.

Before deploying application code, run the checked-in temporary-file SQLite migration tests:

```bash
npm test -- --run tests/lib/family-auth-schema.test.ts tests/lib/family-members-schema.test.ts tests/lib/auth-quality-schema.test.ts tests/lib/family-migrations-runner.test.ts
```

Never test this procedure against the production database.
