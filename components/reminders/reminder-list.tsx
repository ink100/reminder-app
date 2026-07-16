import { ReminderRow } from "@/components/reminders/reminder-row";
import { groupReminderItems } from "@/lib/reminder-groups";
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
    <div className="space-y-5">
      {groupReminderItems(reminders).map((group) => (
        <section key={group.name} className="space-y-3" aria-labelledby={`reminder-group-${group.name}`}>
          <div className="flex items-center gap-3">
            <h2 id={`reminder-group-${group.name}`} className="text-balance text-sm font-semibold text-slate-800">{group.name}</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{group.items.length}</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="space-y-3">
            {group.items.map((reminder) => (
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
        </section>
      ))}
    </div>
  );
}
