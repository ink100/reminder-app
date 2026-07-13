import { ReminderRow } from "@/components/reminders/reminder-row";
import type { ReminderViewItem } from "@/lib/reminder-view";

export function ReminderList({ reminders }: { reminders: ReminderViewItem[] }) {
  if (reminders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 sm:p-8">
        当前筛选条件下没有提醒事项。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reminders.map((reminder) => (
        <ReminderRow
          key={reminder.id}
          id={reminder.id}
          title={reminder.title}
          activationCode={reminder.activationCode}
          activationContact={reminder.activationContact}
          dueAt={reminder.dueAt}
          priority={reminder.priority}
          category={reminder.category}
          riskLevel={reminder.riskLevel}
        />
      ))}
    </div>
  );
}
