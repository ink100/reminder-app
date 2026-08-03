import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Nuxt configuration", () => {
  it("uses the root Nuxt 4 app with SSR, Element Plus, and node-server Nitro", () => {
    const config = readProjectFile("nuxt.config.ts");

    expect(config).not.toMatch(/srcDir\s*:/);
    expect(config).toMatch(/compatibilityVersion:\s*4/);
    expect(config).toMatch(/ssr:\s*true/);
    expect(config).toMatch(/modules:\s*\[[^\]]*["']@element-plus\/nuxt["']/);
    expect(config).toMatch(/preset:\s*["']node-server["']/);
    expect(config).toMatch(/css:\s*\[[^\]]*["']~\/assets\/css\/main\.css["']/);
  });

  it("does not expose secrets through public runtime config", () => {
    const config = readProjectFile("nuxt.config.ts");
    expect(config).not.toMatch(/public\s*:\s*\{[^}]*(secret|token|password|apiKey)/i);
  });

  it("uses pinned Nuxt dependencies and Nuxt lifecycle scripts", () => {
    const packageJson = JSON.parse(readProjectFile("package.json"));

    expect(packageJson.scripts).toMatchObject({
      dev: "nuxt dev",
      build: "nuxt build",
      start: "node .output/server/index.mjs",
      typecheck: "nuxt typecheck",
      test: "vitest run",
    });
    expect(packageJson.dependencies).toMatchObject({
      nuxt: "4.5.1",
      "element-plus": "2.14.3",
    });
  });
});
