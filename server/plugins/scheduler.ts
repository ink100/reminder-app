import { ensureScheduler } from "@/lib/scheduler-init";
import { defineNitroPlugin } from "nitropack/runtime";

declare global {
  var __reminderSchedulerInitialization: Promise<void> | undefined;
}

/** Start the process-wide scheduler unless the caller explicitly disables it. */
export async function initializeScheduler(enabled: boolean): Promise<void> {
  if (enabled === false) return;

  if (!globalThis.__reminderSchedulerInitialization) {
    globalThis.__reminderSchedulerInitialization = ensureScheduler().catch((error) => {
      delete globalThis.__reminderSchedulerInitialization;
      throw error;
    });
  }

  await globalThis.__reminderSchedulerInitialization;
}

export default defineNitroPlugin(async () => {
  const enabled = process.env.NODE_ENV !== "test" && process.env.SCHEDULER_ENABLED !== "false";
  await initializeScheduler(enabled);
});