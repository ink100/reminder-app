import { beforeEach, describe, expect, it, vi } from "vitest";

const requireApiSession = vi.hoisted(() => vi.fn());
const reminder = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn() }));

vi.mock("@/lib/auth", () => ({ requireApiSession }));
vi.mock("@/lib/reminders/store", () => ({ supabaseModels: { reminder } }));

import { POST } from "@/app/api/reminders/[id]/restore/route";

describe("POST /api/reminders/[id]/restore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireApiSession.mockResolvedValue({ user: { role: "ADMIN" } });
    reminder.findFirst.mockResolvedValue({ id: "reminder-1", completedAt: new Date("2026-07-31T08:00:00.000Z") });
    reminder.update.mockResolvedValue({ id: "reminder-1", completedAt: null });
  });

  it("restores a completed reminder and resets notification markers", async () => {
    const response = await POST(new Request("https://test", { method: "POST" }) as never, {
      params: Promise.resolve({ id: "reminder-1" }),
    });

    expect(response.status).toBe(200);
    expect(reminder.findFirst).toHaveBeenCalledWith({
      where: { id: "reminder-1", deletedAt: null, completedAt: { not: null } },
    });
    expect(reminder.update).toHaveBeenCalledWith({
      where: { id: "reminder-1" },
      data: { completedAt: null, upcomingNotifiedAt: null, overdueNotifiedAt: null },
    });
  });

  it("rejects unauthenticated restore requests", async () => {
    requireApiSession.mockResolvedValue(null);

    const response = await POST(new Request("https://test", { method: "POST" }) as never, {
      params: Promise.resolve({ id: "reminder-1" }),
    });

    expect(response.status).toBe(401);
    expect(reminder.update).not.toHaveBeenCalled();
  });
});
