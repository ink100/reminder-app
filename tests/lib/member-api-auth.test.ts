import { describe, expect, it } from "vitest";

import { adminApiAuthorizationStatus } from "@/lib/member-api-auth";

describe("admin member API authorization", () => {
  it("returns 401 only for anonymous and 403 for authenticated MEMBER", () => {
    expect(adminApiAuthorizationStatus(null)).toBe(401);
    expect(adminApiAuthorizationStatus({ user: { role: "MEMBER" } })).toBe(403);
    expect(adminApiAuthorizationStatus({ user: { role: "ADMIN" } })).toBeNull();
  });
});
