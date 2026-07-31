import type { ReminderListItem } from "@/lib/reminder-view";

export type DeletedReminderListItem = ReminderListItem & {
  deletedAt: string;
};

const priorityLabels: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export function DeletedReminderList({ reminders }: { reminders: DeletedReminderListItem[] }) {
  if (reminders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 sm:p-8">
        暂无已删除的提醒记录。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reminders.map((reminder) => {
        const dueAt = new Date(reminder.dueAt);
        const deletedAt = new Date(reminder.deletedAt);
        return (
          <article key={reminder.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-600">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="break-words text-sm font-semibold text-slate-700">{reminder.title}</h2>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">已删除</span>
                </div>
                {reminder.description ? <p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-500">{reminder.description}</p> : null}
                <p className="mt-2 text-xs text-slate-400">
                  {reminder.category ?? "未分类"} · {priorityLabels[reminder.priority] ?? reminder.priority}
                </p>
              </div>
              <div className="shrink-0 text-xs text-slate-400 sm:text-right">
                <p>原到期：{dueAt.toLocaleString("zh-CN")}</p>
                <p className="mt-1">删除于：{deletedAt.toLocaleString("zh-CN")}</p>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
