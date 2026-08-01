import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("completed reminder history query", () => {
  it("does not cap completed history without pagination", async () => {
    const page = await readFile("app/(protected)/reminders/page.tsx", "utf8");
    const completedQuery = page.match(
      /where: \{ deletedAt: null, completedAt: \{ not: null \} \}[\s\S]*?supabaseModels\.reminder\.count/,
    )?.[0] ?? "";

    expect(completedQuery).toContain('orderBy: { completedAt: "desc" }');
    expect(completedQuery).not.toContain("take:");
  });
});
