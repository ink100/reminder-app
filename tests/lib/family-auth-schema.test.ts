import { describe, expect, it } from "vitest";

import { buildFamilyAuthMigrationPlan } from "@/scripts/apply-family-auth-v1";

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
});