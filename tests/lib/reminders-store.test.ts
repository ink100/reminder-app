import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "secret" } }));

import { attachmentStore, createCuid, mapRow, reminderStore } from "@/lib/reminders/store";

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("Supabase reminder store", () => {
  it("maps snake_case fields and timestamp strings to camelCase Dates", () => {
    const item = mapRow<{ reminderId: string; dueAt: Date; deletedAt: null }>({ reminder_id: "c123", due_at: "2026-07-12T00:00:00.000Z", deleted_at: null });
    expect(item).toEqual({ reminderId: "c123", dueAt: new Date("2026-07-12T00:00:00.000Z"), deletedAt: null });
  });

  it("sends supported filters, OR, ordering, pagination and exact select", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ id: "c1", title: "Only" }]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await reminderStore.findMany({
      where: { deletedAt: null, dueAt: { lte: new Date("2026-07-12T00:00:00Z") }, OR: [{ title: { contains: "needle" } }, { category: { startsWith: "ssl" } }] },
      select: { id: true, title: true, description: false }, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }], skip: 2, take: 5,
    });
    expect(result).toEqual([{ id: "c1", title: "Only" }]);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("select")).toBe("id,title");
    expect(url.searchParams.get("deleted_at")).toBe("is.null");
    expect(url.searchParams.get("due_at")).toBe("lte.2026-07-12T00:00:00.000Z");
    expect(url.searchParams.get("or")).toBe('(title.ilike."*needle*",category.like."ssl*")');
    expect(url.searchParams.get("order")).toBe("due_at.asc,created_at.desc");
    expect(url.searchParams.get("offset")).toBe("2"); expect(url.searchParams.get("limit")).toBe("5");
  });

  it("applies nested reminder select without exposing other reminder fields", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([{ id: "a1", filename: "f", reminder_id: "r1" }]))
      .mockResolvedValueOnce(jsonResponse([{ id: "r1", title: "Shown" }]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await attachmentStore.findMany({ include: { reminder: { select: { id: true, title: true } } } });
    expect(result[0]).toEqual({ id: "a1", filename: "f", reminderId: "r1", reminder: { id: "r1", title: "Shown" } });
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get("select")).toBe("id,title");
  });

  it("rejects unsupported predicates instead of silently broadening queries", async () => {
    await expect(reminderStore.findMany({ where: { dueAt: { gte: new Date() } } })).rejects.toThrow("Unsupported predicate for dueAt");
    await expect(reminderStore.findMany({ where: { OR: [{ title: { contains: "x" }, category: "y" }] } })).rejects.toThrow("exactly one predicate");
  });

  it("escapes PostgREST wildcard and logic characters in literal search text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    await reminderStore.findMany({ where: { OR: [{ title: { contains: "a,b%_*()" } }] } });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("or")).toBe('(title.ilike."*a\\,b\\%\\_\\*\\(\\)*")');
  });

  it("generates Prisma-compatible CUID v1 identifiers", () => {
    const first = createCuid(1_720_742_400_000); const second = createCuid(1_720_742_400_000);
    expect(first).toMatch(/^c[a-z0-9]{24}$/); expect(second).toMatch(/^c[a-z0-9]{24}$/); expect(first).not.toBe(second);
  });
});
