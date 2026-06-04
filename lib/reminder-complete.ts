import { computeNextRecurringDueAt, type ReminderRecurrenceType } from "@/lib/reminder-recurrence";

type ReminderCompletionInput = {
  completedAt: Date;
  recurrenceType: string | null;
  recurrenceInterval: number | null;
};

type ReminderCompletionUpdateData = {
  dueAt?: Date;
  completedAt: Date | null;
  upcomingNotifiedAt?: Date | null;
  overdueNotifiedAt?: Date | null;
};

const RECURRENCE_TYPES = new Set<ReminderRecurrenceType>(["daily", "weekly", "monthly", "yearly"]);

function isReminderRecurrenceType(value: string | null): value is ReminderRecurrenceType {
  return value !== null && RECURRENCE_TYPES.has(value as ReminderRecurrenceType);
}

export function buildReminderCompletionUpdate({
  completedAt,
  recurrenceType,
  recurrenceInterval,
}: ReminderCompletionInput): { data: ReminderCompletionUpdateData; recurrenceAdvanced: boolean } {
  if (isReminderRecurrenceType(recurrenceType) && recurrenceInterval && recurrenceInterval > 0) {
    return {
      recurrenceAdvanced: true,
      data: {
        dueAt: computeNextRecurringDueAt({
          completedAt,
          recurrenceType,
          recurrenceInterval,
        }),
        completedAt: null,
        upcomingNotifiedAt: null,
        overdueNotifiedAt: null,
      },
    };
  }

  return {
    recurrenceAdvanced: false,
    data: { completedAt },
  };
}
