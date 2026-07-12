import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-secret" } }));
import { appSettingStore } from "@/lib/app-settings/store";

const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
afterEach(() => vi.unstubAllGlobals());

describe("AppSetting Supabase store", () => {
  it("reads singleton rows and restores Date semantics", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response([{ id: 1, app_name: "提醒", otp_configured_at: "2026-07-12T00:00:00.000Z", telegram_bot_last_test_at: null, created_at: "2026-07-11T00:00:00.000Z", updated_at: "2026-07-12T00:00:00.000Z" }]));
    vi.stubGlobal("fetch", fetchMock);
    const item = await appSettingStore.findUnique({ where: { id: 1 } });
    expect(item?.appName).toBe("提醒");
    expect(item?.otpConfiguredAt).toBeInstanceOf(Date);
    expect(item?.createdAt).toBeInstanceOf(Date);
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("id")).toBe("eq.1");
  });

  it("updates timestamps and preserves credential strings byte-for-byte", async () => {
    const secret = "enc:v1:AA+/=\nopaque";
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return response([{ id: 1, ...body }]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const item = await appSettingStore.update({ where: { id: 1 }, data: { smtpPassEncrypted: secret, r2SecretKey: secret } });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.smtp_pass_encrypted).toBe(secret); expect(body.r2_secret_key).toBe(secret);
    expect(new Date(body.updated_at)).toBeInstanceOf(Date); expect(item.updatedAt).toBeInstanceOf(Date);
  });

  it("upsert is a no-op for an existing row with empty update", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response([{ id: 1, app_name: "existing", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" }]));
    vi.stubGlobal("fetch", fetchMock);
    const item = await appSettingStore.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
    expect(item.appName).toBe("existing"); expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects non-singleton identifiers", async () => {
    await expect(appSettingStore.findUnique({ where: { id: 2 } })).rejects.toThrow("singleton id=1");
  });
});
