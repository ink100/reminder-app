export type ReminderNotificationCandidate = {
  id: string;
  title: string;
  dueAt: Date;
  remindBeforeDays: number;
  remindBeforeHours: number;
  overdueRemindEnabled: boolean;
  upcomingNotifiedAt: Date | null;
  overdueNotifiedAt: Date | null;
};

export type ReminderNotificationKind = "upcoming" | "overdue";

export function collectReminderNotifications(
  reminders: ReminderNotificationCandidate[],
  now = new Date(),
): Array<{ id: string; kind: ReminderNotificationKind }> {
  const notifications: Array<{ id: string; kind: ReminderNotificationKind }> = [];

  for (const reminder of reminders) {
    const remindAt = new Date(
      reminder.dueAt.getTime() - (reminder.remindBeforeDays * 24 + reminder.remindBeforeHours) * 60 * 60 * 1000,
    );

    if (now >= reminder.dueAt && reminder.overdueRemindEnabled && !reminder.overdueNotifiedAt) {
      notifications.push({ id: reminder.id, kind: "overdue" });
      continue;
    }

    if (now >= remindAt && now < reminder.dueAt && !reminder.upcomingNotifiedAt) {
      notifications.push({ id: reminder.id, kind: "upcoming" });
    }
  }

  return notifications;
}

export function isMailTransportConfigured(
  env: Record<string, string | undefined> | null | undefined,
) {
  if (!env) {
    return false;
  }

  return Boolean(
    env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM_EMAIL,
  );
}
