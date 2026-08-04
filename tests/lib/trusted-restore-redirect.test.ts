import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const restoreSessionFromTrustedDevice = vi.hoisted(() => vi.fn());
const deleteTrustedDeviceCookie = vi.hoisted(() => vi.fn());

vi.mock("@/lib/trusted-device", () => ({
  restoreSessionFromTrustedDevice,
  deleteTrustedDeviceCookie,
}));
vi.mock("@/lib/login-throttle", () => ({ getTrustedClientIp: vi.fn(() => null) }));
vi.mock("@/lib/env", () => ({ env: { APP_BASE_URL: "https://ne.daydreams.cn" } }));

import { GET } from "@/server/handlers/api/auth/trusted/restore/route";

describe("trusted-device restore redirect-loop protection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks a failed restore and preserves the requested return URL", async () => {
    restoreSessionFromTrustedDevice.mockResolvedValue({ status: "invalid" });

    const response = await GET(new Request(
      "https://ne.daydreams.cn/api/auth/trusted/restore?next=%2Freminders%3Fview%3Dopen",
      { headers: { host: "ne.daydreams.cn", "x-forwarded-proto": "https" } },
    ));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://ne.daydreams.cn/auth?trustedRestore=failed&returnUrl=%2Freminders%3Fview%3Dopen",
    );
    expect(deleteTrustedDeviceCookie).toHaveBeenCalledOnce();
  });

  it("does not retry trusted-device restoration after the restore endpoint reports failure", () => {
    const source = readFileSync(resolve("app/pages/auth.vue"), "utf8");
    expect(source).toContain('route.query.trustedRestore !== "failed"');
    expect(source).toMatch(/hasTrustedDevice\s*&&\s*trustedRestoreAllowed\s*&&/);
  });
});
