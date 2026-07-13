import { ReminderForm } from "@/components/reminders/reminder-form";

export default function NewReminderPage() {
  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div>
        <p className="text-sm text-slate-500">新增提醒</p>
        <h1 className="text-xl font-semibold text-slate-950 sm:text-2xl">创建一条新的提醒事项</h1>
      </div>
      <ReminderForm mode="create" />
    </div>
  );
}
