import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ensureScheduler = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/scheduler-init", () => ({ ensureScheduler }));
vi.mock("nitropack/runtime", () => ({ defineNitroPlugin: (plugin: unknown) => plugin }));

import { initializeScheduler } from "@/server/plugins/scheduler";

describe("scheduler Nitro plugin", () => {
  beforeEach(() => {
    delete globalThis.__reminderSchedulerInitialization;
    ensureScheduler.mockClear();
  });

  afterEach(() => {
    delete globalThis.__reminderSchedulerInitialization;
  });

  it("does not start when explicitly disabled", async () => {
    await initializeScheduler(false);
    expect(ensureScheduler).not.toHaveBeenCalled();
  });

  it("does not start twice, including concurrent and HMR-style initialization", async () => {
    await Promise.all([initializeScheduler(true), initializeScheduler(true)]);
    await initializeScheduler(true);
    expect(ensureScheduler).toHaveBeenCalledTimes(1);
  });
});