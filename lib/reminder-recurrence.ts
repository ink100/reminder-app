export type ReminderRecurrenceType = "daily" | "weekly" | "monthly";

export function computeNextRecurringDueAt({
  completedAt,
  recurrenceType,
  recurrenceInterval,
}: {
  completedAt: Date;
  recurrenceType: ReminderRecurrenceType;
  recurrenceInterval: number;
}) {
  const next = new Date(completedAt);

  if (recurrenceType === "daily") {
    next.setUTCDate(next.getUTCDate() + recurrenceInterval);
    return next;
  }

  if (recurrenceType === "weekly") {
    next.setUTCDate(next.getUTCDate() + recurrenceInterval * 7);
    return next;
  }

  const originalDay = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + recurrenceInterval + 1, 0);
  const maxDay = next.getUTCDate();
  next.setUTCDate(Math.min(originalDay, maxDay));
  next.setUTCHours(completedAt.getUTCHours(), completedAt.getUTCMinutes(), completedAt.getUTCSeconds(), completedAt.getUTCMilliseconds());
  return next;
}
