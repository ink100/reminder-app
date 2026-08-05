import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("useApi SSR request context", () => {
  it("uses Nuxt request-aware fetch during SSR so protected API calls forward the incoming session cookie", () => {
    const source = readFileSync(resolve("app/composables/useApi.ts"), "utf8");

    expect(source).toContain("import.meta.server ? useRequestFetch() : $fetch");
    expect(source).toContain("return await requestFetch<T>(url");
    expect(source).not.toContain("return await $fetch<T>(url");
  });
});
