import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { adminApiAuthorizationStatus, sharedApiAuthorizationStatus } from "@/lib/member-api-auth";
import { getNavigationItems } from "@/lib/navigation";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

const adminPages = [
  "members", "settings", "bot", "ssl", "notification-center", "push-ledger", "license-key",
];

const adminRouteFiles = [
  "app/api/admin/members/route.ts",
  "app/api/admin/members/[id]/route.ts",
  "app/api/admin/members/[id]/revoke-access/route.ts",
  "app/api/admin/member-invitations/[id]/route.ts",
  "app/api/settings/route.ts",
  "app/api/settings/r2/route.ts",
  "app/api/settings/test-email/route.ts",
  "app/api/settings/bot/route.ts",
  "app/api/settings/bot/bindings/route.ts",
  "app/api/settings/otp/reset/route.ts",
  "app/api/auth/otp/setup/route.ts",
  "app/api/auth/otp/verify-setup/route.ts",
  "app/api/ssl/route.ts",
  "app/api/scheduler/status/route.ts",
  "app/api/license/generate/route.ts",
  "app/api/license/store-accounts/route.ts",
  "app/api/license/store-accounts/[id]/route.ts",
  "app/api/license/store-accounts/[id]/payment-qr/route.ts",
  "app/api/notification-center/api-keys/route.ts",
  "app/api/notification-center/dispatch/route.ts",
  "app/api/notification-center/channels/route.ts",
  "app/api/notification-center/groups/route.ts",
  "app/api/notification-center/groups/[id]/route.ts",
  "app/api/notification-center/groups/[id]/routes/[channelId]/route.ts",
  "app/api/notification-center/templates/route.ts",
  "app/api/notification-center/templates/[id]/route.ts",
  "app/api/push-ledger/route.ts",
  "app/channels/route.ts",
  "app/groups/route.ts",
  "app/templates/route.ts",
  "app/notifications/route.ts",
  "app/notifications/[id]/route.ts",
  "app/queue/jobs/route.ts",
  "app/queue/retry/[job_id]/route.ts",
  "app/cancel/[id]/route.ts",
];

const sharedRouteFiles = [
  "app/api/reminders/route.ts", "app/api/todos/route.ts", "app/api/medicines/route.ts",
  "app/api/images/route.ts", "app/api/attachments/route.ts", "app/api/upload/route.ts",
  "app/api/voice/tts/route.ts", "app/api/voice/transcriptions/route.ts",
  "app/api/auth/passkey/list/route.ts", "app/api/auth/trusted/devices/route.ts",
];

describe("role authorization matrix", () => {
  it("distinguishes anonymous, members, admins, and unknown roles", () => {
    expect(adminApiAuthorizationStatus(null)).toBe(401);
    expect(adminApiAuthorizationStatus({ user: { role: "MEMBER" } })).toBe(403);
    expect(adminApiAuthorizationStatus({ user: { role: "UNKNOWN" } })).toBe(403);
    expect(adminApiAuthorizationStatus({ user: { role: "ADMIN" } })).toBeNull();
    expect(sharedApiAuthorizationStatus(null)).toBe(401);
    expect(sharedApiAuthorizationStatus({ user: { role: "MEMBER" } })).toBeNull();
    expect(sharedApiAuthorizationStatus({ user: { role: "ADMIN" } })).toBeNull();
    expect(sharedApiAuthorizationStatus({ user: { role: "UNKNOWN" } })).toBe(403);
  });

  it.each(adminPages)("server-guards the /%s page", (page) => {
    expect(source(`app/(protected)/${page}/layout.tsx`)).toContain("requireAdminPage");
  });

  it.each(adminRouteFiles)("uses the central admin API guard in %s", (file) => {
    expect(source(file)).toMatch(/requireAdminApi|requireAdminMemberApi/);
    expect(source(file)).not.toContain("requireApiSession");
  });

  it.each(sharedRouteFiles)("keeps shared authenticated access in %s", (file) => {
    expect(source(file)).toContain("requireApiSession");
    expect(source(file)).not.toContain("requireAdminApi");
  });

  it("does not alter the API-key /notify machine route", () => {
    expect(source("app/notify/route.ts")).not.toContain("requireAdminApi");
  });
});

describe("role-aware navigation and account placement", () => {
  it("filters all admin destinations for members", () => {
    const memberHrefs = getNavigationItems("MEMBER").map((item) => item.href);
    expect(memberHrefs).toEqual(expect.arrayContaining(["/reminders", "/todos", "/medicines", "/images", "/voice", "/account"]));
    for (const page of adminPages) expect(memberHrefs).not.toContain(`/${page}`);
  });

  it("includes members and all admin links for admins and fails unknown roles closed", () => {
    const adminHrefs = getNavigationItems("ADMIN").map((item) => item.href);
    for (const page of adminPages) expect(adminHrefs).toContain(`/${page}`);
    expect(getNavigationItems("UNKNOWN")).toEqual([]);
  });

  it("moves self-security cards out of settings and into account", () => {
    const settings = source("app/(protected)/settings/page.tsx");
    const account = source("app/(protected)/account/page.tsx");
    expect(settings).not.toMatch(/PasskeyManager|TrustedDevicesCard/);
    expect(account).toMatch(/PasskeyManager/);
    expect(account).toMatch(/TrustedDevicesCard/);
    expect(account).not.toMatch(/TotpEnrollmentCard/);
  });

  it("clears a prior account trusted cookie before exposing non-remembered or invitation sessions", () => {
    for (const file of [
      "app/api/auth/otp/login/route.ts",
      "app/api/auth/passkey/login/verify/route.ts",
      "app/api/invite/[token]/totp/verify/route.ts",
      "app/api/invite/[token]/passkey/verify/route.ts",
    ]) {
      const route = source(file);
      expect(route).toContain("deleteTrustedDeviceCookie");
      expect(route.indexOf("deleteTrustedDeviceCookie()"))
        .toBeLessThan(route.indexOf("setSessionCookie("));
    }
  });

  it("uses the transaction-created invitation session without creating a second session", () => {
    for (const file of ["app/api/invite/[token]/totp/verify/route.ts", "app/api/invite/[token]/passkey/verify/route.ts"]) {
      const route = source(file);
      expect(route).toContain("setSessionCookie(result.sessionToken)");
      expect(route).not.toMatch(/createSession|deleteCurrentSession/);
      expect(route).toMatch(/ipAddress[\s\S]*userAgent/);
      expect(route).toMatch(/status: 500/);
    }
  });
});

describe("member management UI", () => {
  it("provides invitation, role/status, access revocation and invitation revocation controls", () => {
    const ui = source("components/members/member-management.tsx");
    expect(ui).toMatch(/username/);
    expect(ui).toMatch(/displayName/);
    expect(ui).toMatch(/expiresInHours/);
    expect(ui).toContain("navigator.clipboard.writeText");
    expect(ui).toContain("revoke-access");
    expect(ui).toContain("member-invitations");
    expect(ui).toMatch(/legacy-admin/);
    expect(ui).toMatch(/AlertDialog/);
  });
});
