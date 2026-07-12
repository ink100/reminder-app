import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-secret" } }));
import { ensureAppSettings } from "@/lib/bootstrap-settings";

const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
afterEach(() => vi.unstubAllGlobals());

describe("AppSetting bootstrap migration gate", () => {
  it("fails closed without the transactional migration marker and does not write defaults", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response([])); vi.stubGlobal("fetch", fetchMock);
    await expect(ensureAppSettings()).rejects.toThrow("migration is not complete");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined();
  });
  it("permits normal singleton behavior after the marker exists", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response([{ version: "app-settings-v1" }])).mockResolvedValueOnce(response([{ id: 1, app_name: "existing", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(ensureAppSettings()).resolves.toMatchObject({ id: 1, appName: "existing" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
