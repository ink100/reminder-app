export type ReminderRecurrenceType = "daily" | "weekly" | "monthly" | "yearly";

function addUtcMonthsClamped(date: Date, months: number) {
  const next = new Date(date);
  const originalDay = next.getUTCDate();

  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months + 1, 0);
  const maxDay = next.getUTCDate();
  next.setUTCDate(Math.min(originalDay, maxDay));
  next.setUTCHours(date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds());

  return next;
}

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

  if (recurrenceType === "yearly") {
    return addUtcMonthsClamped(completedAt, recurrenceInterval * 12);
  }

  return addUtcMonthsClamped(completedAt, recurrenceInterval);
}
