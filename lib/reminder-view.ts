import { getReminderRiskLevel, type ReminderRiskLevel } from "@/lib/risk-level";

export type ReminderListItem = {
  id: string;
  title: string;
  description: string | null;
  activationCode: string | null;
  activationContact: string | null;
  dueAt: string;
  priority: string;
  category: string | null;
  completedAt: string | null;
  remindBeforeDays: number;
};

export type ReminderStatusFilter = "all" | ReminderRiskLevel;
export type ReminderPriorityFilter = "all" | "high" | "medium" | "low";
export type ReminderStatKey = "total" | ReminderRiskLevel;

export type ReminderStats = {
  total: number;
  warning: number;
  urgent: number;
  overdue: number;
  completed: number;
};

export type ReminderViewItem = ReminderListItem & {
  riskLevel: ReminderRiskLevel;
};

export const reminderRiskLabels: Record<ReminderRiskLevel, string> = {
  normal: "正常",
  warning: "即将到期",
  urgent: "24h 内",
  overdue: "已超期",
  completed: "已完成",
};

export function buildReminderViewItems(reminders: ReminderListItem[], now = new Date()): ReminderViewItem[] {
  return reminders.map((reminder) => ({
    ...reminder,
    riskLevel: getReminderRiskLevel({
      dueAt: new Date(reminder.dueAt),
      completedAt: reminder.completedAt ? new Date(reminder.completedAt) : null,
      remindBeforeDays: reminder.remindBeforeDays,
      now,
    }),
  }));
}

export function buildReminderStats(reminders: ReminderListItem[], now = new Date()): ReminderStats {
  return buildReminderViewItems(reminders, now).reduce(
    (acc, reminder) => {
      acc.total += 1;
      if (reminder.riskLevel === "warning") acc.warning += 1;
      if (reminder.riskLevel === "urgent") acc.urgent += 1;
      if (reminder.riskLevel === "overdue") acc.overdue += 1;
      if (reminder.riskLevel === "completed") acc.completed += 1;
      return acc;
    },
    { total: 0, warning: 0, urgent: 0, overdue: 0, completed: 0 },
  );
}

export function filterReminders(
  reminders: ReminderListItem[],
  {
    search,
    status,
    priority,
    now = new Date(),
  }: {
    search: string;
    status: ReminderStatusFilter;
    priority: ReminderPriorityFilter;
    now?: Date;
  },
): ReminderViewItem[] {
  const keyword = search.trim().toLowerCase();

  return buildReminderViewItems(reminders, now).filter((reminder) => {
    const matchesSearch =
      keyword.length === 0 ||
      [
        reminder.title,
        reminder.description ?? "",
        reminder.category ?? "",
        reminder.activationCode ?? "",
        reminder.activationContact ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);

    const matchesStatus = status === "all" || reminder.riskLevel === status;
    const matchesPriority = priority === "all" || reminder.priority === priority;

    return matchesSearch && matchesStatus && matchesPriority;
  });
}
