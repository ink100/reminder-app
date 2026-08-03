import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { loadProjectEnv } from "@/lib/load-env";

describe("production environment loading", () => {
  it("uses an explicit loader call so Nitro cannot tree-shake dotenv initialization", () => {
    const envSource = readFileSync(resolve(process.cwd(), "lib/env.ts"), "utf8");
    const loaderSource = readFileSync(resolve(process.cwd(), "lib/load-env.ts"), "utf8");

    expect(envSource).toContain('import { loadProjectEnv } from "@/lib/load-env"');
    expect(envSource).toContain("loadProjectEnv();");
    expect(loaderSource).toContain("export function loadProjectEnv()");
  });

  it("loads production env files in the legacy priority order", () => {
    const directory = mkdtempSync(join(tmpdir(), "reminder-env-"));
    const previousDirectory = process.cwd();
    const previousMode = process.env.NODE_ENV;
    const key = "REMINDER_ENV_PRIORITY_TEST";
    const previousValue = process.env[key];

    try {
      writeFileSync(join(directory, ".env"), `${key}=base\n`);
      writeFileSync(join(directory, ".env.production"), `${key}=production\n`);
      writeFileSync(join(directory, ".env.local"), `${key}=local\n`);
      writeFileSync(join(directory, ".env.production.local"), `${key}=production-local\n`);
      process.chdir(directory);
      process.env.NODE_ENV = "production";
      Reflect.deleteProperty(process.env, key);

      loadProjectEnv();

      expect(process.env[key]).toBe("production-local");
    } finally {
      process.chdir(previousDirectory);
      if (previousMode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousMode;
      if (previousValue === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = previousValue;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});