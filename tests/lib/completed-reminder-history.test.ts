import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("completed reminder history query", () => {
  it("does not cap completed history without pagination", async () => {
    const handler = await readFile("server/handlers/api/reminders/route.ts", "utf8");
    const listQuery = handler.match(/supabaseModels\.reminder\.findMany\([\s\S]*?\);/)?.[0] ?? "";

    expect(listQuery).toContain('orderBy: { dueAt: "asc" }');
    expect(listQuery).not.toContain("take:");
    expect(listQuery).not.toContain("completedAt: null");
  });
});
