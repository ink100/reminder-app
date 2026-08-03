import { describe, expect, it, vi } from "vitest";

const requireApiSession = vi.hoisted(() => vi.fn());
const generateRegOptions = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireApiSession }));
vi.mock("@/lib/webauthn", () => ({ generateRegOptions }));

import { GET } from "@/server/handlers/api/auth/passkey/register/route";

describe("passkey registration safety", () => {
  it("rejects anonymous registration before generating options", async () => {
    requireApiSession.mockResolvedValue(null);
    const response = await GET(new Request("https://example.test/api/auth/passkey/register") as never);
    expect(response.status).toBe(401);
    expect(generateRegOptions).not.toHaveBeenCalled();
  });
});
