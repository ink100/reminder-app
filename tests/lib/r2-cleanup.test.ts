import { describe, expect, it, vi } from "vitest";

import { cleanupR2Keys } from "@/lib/r2-cleanup";

describe("cleanupR2Keys", () => {
  it("deduplicates keys and retries transient deletion failures", async () => {
    const attempts = new Map<string, number>();
    const remove = vi.fn(async (key: string) => {
      const count = (attempts.get(key) ?? 0) + 1;
      attempts.set(key, count);
      if (key === "retry" && count < 3) throw new Error("temporary");
    });

    await expect(cleanupR2Keys([null, "ok", "retry", "ok"], remove)).resolves.toEqual([]);
    expect(remove).toHaveBeenCalledTimes(4);
  });

  it("returns keys that still fail after all attempts", async () => {
    const remove = vi.fn(async () => {
      throw new Error("offline");
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(cleanupR2Keys(["stuck"], remove, 2)).resolves.toEqual(["stuck"]);
    expect(remove).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });
});
