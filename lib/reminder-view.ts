import { getReminderRiskLevel, type ReminderRiskLevel } from "@/lib/risk-level";
import { getReminderGroup, type ReminderGroupFilter } from "@/lib/reminder-groups";

export type ReminderListItem = {
  id: string;
  title: string;
  description: string | null;
  hasActivationCode: boolean;
  activationContact: string | null;
  dueAt: string;
  priority: string;
  category: string | null;
  completedAt: string | null;
  remindBeforeDays: number;
};

type ReminderListSource = Omit<ReminderListItem, "hasActivationCode" | "dueAt" | "completedAt"> & {
  activationCode: string | null;
  dueAt: Date;
  completedAt: Date | null;
};

export function serializeReminderForList(reminder: ReminderListSource): ReminderListItem {
  return {
    id: reminder.id,
    title: reminder.title,
    description: reminder.description,
    hasActivationCode: Boolean(reminder.activationCode?.trim()),
    activationContact: reminder.activationContact,
    dueAt: reminder.dueAt.toISOString(),
    priority: reminder.priority,
    category: reminder.category,
    completedAt: reminder.completedAt?.toISOString() ?? null,
    remindBeforeDays: reminder.remindBeforeDays,
  };
}

export type ReminderStatusFilter = "all" | Exclude<ReminderRiskLevel, "completed">;
export type ReminderPriorityFilter = "all" | "high" | "medium" | "low";
export type ReminderStatKey = "total" | Exclude<ReminderRiskLevel, "completed">;

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
    group = "all",
    now = new Date(),
  }: {
    search: string;
    status: ReminderStatusFilter;
    priority: ReminderPriorityFilter;
    group?: ReminderGroupFilter;
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
        reminder.activationContact ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);

    const matchesStatus = status === "all" || reminder.riskLevel === status;
    const matchesPriority = priority === "all" || reminder.priority === priority;
    const matchesGroup = group === "all" || getReminderGroup(reminder.category) === group;

    return matchesSearch && matchesStatus && matchesPriority && matchesGroup;
  });
}
