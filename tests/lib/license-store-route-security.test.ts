import { beforeEach, describe, expect, it, vi } from "vitest";

const requireApiSession = vi.hoisted(() => vi.fn());
const reminder = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn() }));
const licenseStoreAccount = vi.hoisted(() => ({ findFirst: vi.fn(), updateMany: vi.fn() }));

vi.mock("@/lib/auth", () => ({ requireApiSession }));
vi.mock("@/lib/reminders/store", () => ({ supabaseModels: { reminder, licenseStoreAccount } }));

import { PUT } from "@/server/handlers/api/reminders/[id]/route";
import { POST as complete } from "@/server/handlers/api/reminders/[id]/complete/route";

const context = { params: Promise.resolve({ id: "reminder-1" }) };
const input = {
  title: "Reminder", description: "", activationCode: "", activationContact: "",
  dueAt: "2027-01-01T00:00:00.000Z", priority: "medium", category: "其他",
  remindBeforeDays: 3, remindBeforeHours: 24, overdueRemindEnabled: true,
  recurrenceType: null, recurrenceInterval: null,
};

describe("store-owned reminder route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiSession.mockResolvedValue({ user: { role: "MEMBER" } });
    reminder.findFirst.mockResolvedValue({ id: "reminder-1", completedAt: null, recurrenceType: "yearly", recurrenceInterval: 1 });
    licenseStoreAccount.findFirst.mockResolvedValue({ id: "store-1" });
  });

  it("forbids a member from editing a store-owned reminder", async () => {
    const response = await PUT(new Request("https://test/api/reminders/reminder-1", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    }) as never, context);
    expect(response.status).toBe(403);
    expect(reminder.update).not.toHaveBeenCalled();
    expect(licenseStoreAccount.updateMany).not.toHaveBeenCalled();
  });

  it("forbids a member from completing a store-owned reminder", async () => {
    const response = await complete(new Request("https://test", { method: "POST" }) as never, context);
    expect(response.status).toBe(403);
    expect(reminder.update).not.toHaveBeenCalled();
    expect(licenseStoreAccount.updateMany).not.toHaveBeenCalled();
  });

  it("does not change member permission for an ordinary reminder", async () => {
    licenseStoreAccount.findFirst.mockResolvedValue(null);
    reminder.update.mockResolvedValue({ id: "reminder-1", dueAt: new Date(input.dueAt) });
    const response = await PUT(new Request("https://test/api/reminders/reminder-1", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
    }) as never, context);
    expect(response.status).toBe(200);
    expect(reminder.update).toHaveBeenCalledOnce();
  });
});
