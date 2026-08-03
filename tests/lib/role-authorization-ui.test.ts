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
  "server/handlers/api/admin/members/route.ts",
  "server/handlers/api/admin/members/[id]/route.ts",
  "server/handlers/api/admin/members/[id]/revoke-access/route.ts",
  "server/handlers/api/admin/member-invitations/[id]/route.ts",
  "server/handlers/api/settings/route.ts",
  "server/handlers/api/settings/r2/route.ts",
  "server/handlers/api/settings/test-email/route.ts",
  "server/handlers/api/settings/bot/route.ts",
  "server/handlers/api/settings/bot/bindings/route.ts",
  "server/handlers/api/settings/otp/reset/route.ts",
  "server/handlers/api/auth/otp/setup/route.ts",
  "server/handlers/api/auth/otp/verify-setup/route.ts",
  "server/handlers/api/ssl/route.ts",
  "server/handlers/api/scheduler/status/route.ts",
  "server/handlers/api/license/generate/route.ts",
  "server/handlers/api/license/store-accounts/route.ts",
  "server/handlers/api/license/store-accounts/[id]/route.ts",
  "server/handlers/api/license/store-accounts/[id]/payment-qr/route.ts",
  "server/handlers/api/notification-center/api-keys/route.ts",
  "server/handlers/api/notification-center/dispatch/route.ts",
  "server/handlers/api/notification-center/channels/route.ts",
  "server/handlers/api/notification-center/groups/route.ts",
  "server/handlers/api/notification-center/groups/[id]/route.ts",
  "server/handlers/api/notification-center/groups/[id]/routes/[channelId]/route.ts",
  "server/handlers/api/notification-center/templates/route.ts",
  "server/handlers/api/notification-center/templates/[id]/route.ts",
  "server/handlers/api/push-ledger/route.ts",
  "server/handlers/channels/route.ts",
  "server/handlers/groups/route.ts",
  "server/handlers/templates/route.ts",
  "server/handlers/notifications/route.ts",
  "server/handlers/notifications/[id]/route.ts",
  "server/handlers/queue/jobs/route.ts",
  "server/handlers/queue/retry/[job_id]/route.ts",
  "server/handlers/cancel/[id]/route.ts",
];

const sharedRouteFiles = [
  "server/handlers/api/reminders/route.ts", "server/handlers/api/todos/route.ts", "server/handlers/api/medicines/route.ts",
  "server/handlers/api/images/route.ts", "server/handlers/api/attachments/route.ts", "server/handlers/api/upload/route.ts",
  "server/handlers/api/voice/tts/route.ts", "server/handlers/api/voice/transcriptions/route.ts",
  "server/handlers/api/auth/passkey/list/route.ts", "server/handlers/api/auth/trusted/devices/route.ts",
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

  it.each(adminPages)("keeps authentication and admin metadata on the /%s Nuxt page", (page) => {
    expect(source(`app/pages/${page}.vue`)).toContain('middleware: ["auth", "admin"]');
  });

  it("redirects authenticated non-admin page access to the shared reminders page", () => {
    const middleware = source("app/middleware/admin.ts");
    expect(middleware).toContain('status.actor?.role === "ADMIN"');
    expect(middleware).toContain('navigateTo("/reminders"');
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
    expect(source("server/handlers/notify/route.ts")).not.toContain("requireAdminApi");
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
    const settings = source("app/pages/settings.vue");
    const account = source("app/pages/account.vue");
    expect(settings).not.toMatch(/PasskeyManager|TrustedDevicesCard/);
    expect(account).toMatch(/PasskeyManager/);
    expect(account).toMatch(/TrustedDevicesCard/);
    expect(account).not.toMatch(/TotpEnrollmentCard/);
  });

  it("clears a prior account trusted cookie before exposing non-remembered or invitation sessions", () => {
    for (const file of [
      "server/handlers/api/auth/otp/login/route.ts",
      "server/handlers/api/auth/passkey/login/verify/route.ts",
      "server/handlers/api/invite/[token]/totp/verify/route.ts",
      "server/handlers/api/invite/[token]/passkey/verify/route.ts",
    ]) {
      const route = source(file);
      expect(route).toContain("deleteTrustedDeviceCookie");
      expect(route.indexOf("deleteTrustedDeviceCookie()"))
        .toBeLessThan(route.indexOf("setSessionCookie("));
    }
  });

  it("uses the transaction-created invitation session without creating a second session", () => {
    for (const file of ["server/handlers/api/invite/[token]/totp/verify/route.ts", "server/handlers/api/invite/[token]/passkey/verify/route.ts"]) {
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
    const ui = source("app/components/members/MemberManagement.vue");
    expect(ui).toMatch(/username/);
    expect(ui).toMatch(/displayName/);
    expect(ui).toMatch(/expiresInHours/);
    expect(ui).toContain("navigator.clipboard.writeText");
    expect(ui).toContain("revoke-access");
    expect(ui).toContain("member-invitations");
    expect(ui).toMatch(/legacy-admin/);
    expect(ui).toMatch(/ElMessageBox/);
  });
});
