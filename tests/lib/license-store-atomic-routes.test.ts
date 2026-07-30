import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminApi = vi.hoisted(() => vi.fn());
const callRpc = vi.hoisted(() => vi.fn());
const createCuid = vi.hoisted(() => vi.fn());
const licenseStoreAccount = vi.hoisted(() => ({ findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }));
const reminder = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));

vi.mock("@/lib/admin-api", () => ({ requireAdminApi }));
vi.mock("@/lib/notification-center/store", () => ({ callRpc }));
vi.mock("@/lib/reminders/store", () => ({ supabaseModels: { licenseStoreAccount, reminder }, createCuid }));
vi.mock("@/lib/r2-cleanup", () => ({ cleanupR2Keys: vi.fn() }));

import { POST } from "@/app/api/license/store-accounts/route";
import { PUT } from "@/app/api/license/store-accounts/[id]/route";

const body = {
  shopName: "Store", phone: "13800138000", remoteCode: "remote",
  remotePassword: "password", isOtherAccount: false,
  expiresAt: "2027-02-28T23:59:59.999Z", activationCode: "code",
};
const request = (method: string) => new Request("https://test", {
  method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}) as never;

describe("atomic license store writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminApi.mockResolvedValue({ actor: { user: { role: "ADMIN" } }, response: null });
    callRpc.mockResolvedValue({ id: "account-1", reminder: { id: "reminder-1" } });
    licenseStoreAccount.findUnique.mockResolvedValue({ id: "account-1", reminder: { id: "reminder-1" } });
  });

  it("creates the account and owned reminder through one RPC", async () => {
    createCuid.mockReturnValueOnce("account-1").mockReturnValueOnce("reminder-1");
    const response = await POST(request("POST"));
    expect(response.status).toBe(201);
    expect(callRpc).toHaveBeenCalledWith("create_license_store_account_with_reminder", expect.objectContaining({
      p_account_id: "account-1", p_reminder_id: "reminder-1", p_expires_at: body.expiresAt,
    }));
    expect(reminder.create).not.toHaveBeenCalled();
    expect(licenseStoreAccount.create).not.toHaveBeenCalled();
    expect(licenseStoreAccount.findUnique).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ item: { id: "account-1" } });
  });

  it("updates the account and owned reminder through one RPC", async () => {
    licenseStoreAccount.findFirst.mockResolvedValue({ id: "account-1", reminderId: "reminder-1" });
    const response = await PUT(request("PUT"), { params: Promise.resolve({ id: "account-1" }) });
    expect(response.status).toBe(200);
    expect(callRpc).toHaveBeenCalledWith("update_license_store_account_with_reminder", expect.objectContaining({
      p_account_id: "account-1", p_expires_at: body.expiresAt,
    }));
    expect(reminder.update).not.toHaveBeenCalled();
    expect(licenseStoreAccount.update).not.toHaveBeenCalled();
    expect(licenseStoreAccount.findUnique).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ item: { id: "account-1" } });
  });
});
