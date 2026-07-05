export const NOTIFICATION_STATUSES = ["Created", "Queued", "Processing", "Completed", "Failed", "Cancelled"] as const;
export const QUEUE_JOB_STATUSES = ["Pending", "Processing", "RetryWaiting", "Success", "DeadLetter"] as const;
export const CHANNEL_TYPES = ["Email", "Telegram", "Webhook", "Bark", "Discord", "Slack", "WeCom"] as const;

export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
export type QueueJobStatus = (typeof QUEUE_JOB_STATUSES)[number];
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 120_000, 600_000] as const;

export function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {});
}
