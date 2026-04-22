export type ReminderRiskLevel = "normal" | "warning" | "urgent" | "overdue" | "completed";

type GetReminderRiskLevelInput = {
  dueAt: Date;
  completedAt?: Date | null;
  remindBeforeDays: number;
  now?: Date;
};

export function getReminderRiskLevel({
  dueAt,
  completedAt,
  remindBeforeDays,
  now = new Date(),
}: GetReminderRiskLevelInput): ReminderRiskLevel {
  if (completedAt) {
    return "completed";
  }

  const diffMs = dueAt.getTime() - now.getTime();

  if (diffMs < 0) {
    return "overdue";
  }

  const hoursUntilDue = diffMs / (1000 * 60 * 60);

  if (hoursUntilDue <= 24) {
    return "urgent";
  }

  if (hoursUntilDue <= remindBeforeDays * 24) {
    return "warning";
  }

  return "normal";
}
