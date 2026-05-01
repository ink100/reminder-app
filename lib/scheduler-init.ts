import { refreshAllTimers } from "@/lib/scheduler";

let initialized = false;

export async function ensureScheduler() {
  if (initialized) return;
  initialized = true;

  console.log("[scheduler] 初始化中...");
  await refreshAllTimers();
}
