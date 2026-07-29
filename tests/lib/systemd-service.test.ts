import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("reminder-app systemd unit", () => {
  it("treats the expected Next.js SIGTERM exit as successful", () => {
    const unit = readFileSync(resolve(process.cwd(), "scripts/reminder-app.service"), "utf8");

    expect(unit).toMatch(/^SuccessExitStatus=143 SIGTERM$/m);
  });
});
