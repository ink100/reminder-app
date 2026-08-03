import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("reminder-app systemd unit", () => {
  it("runs the Nuxt Nitro production server on the private application port", () => {
    const unit = readFileSync(resolve(process.cwd(), "scripts/reminder-app.service"), "utf8");

    expect(unit).toMatch(/^Description=Reminder Inventory Nuxt App$/m);
    expect(unit).toMatch(/^Environment=HOST=127\.0\.0\.1$/m);
    expect(unit).toMatch(/^Environment=PORT=63456$/m);
    expect(unit).toMatch(/^ExecStart=\/usr\/bin\/node \/home\/ubuntu\/apps\/reminder-app\/\.output\/server\/index\.mjs$/m);
    expect(unit).toMatch(/^SuccessExitStatus=143 SIGTERM$/m);
    expect(unit).not.toContain("next start");
  });
});
