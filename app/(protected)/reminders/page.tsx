/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseModels } from "@/lib/reminders/store";
import { RemindersDashboard } from "@/components/reminders/reminders-dashboard";
import { serializeReminderForList } from "@/lib/reminder-view";

export default async function RemindersPage() {
  const [reminders, deletedReminders, deletedCount] = await Promise.all([
    supabaseModels.reminder.findMany({
      where: { deletedAt: null },
      orderBy: { dueAt: "asc" },
      take: 100,
    }),
    supabaseModels.reminder.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      take: 100,
    }),
    supabaseModels.reminder.count({ where: { deletedAt: { not: null } } }),
  ]);

  return (
    <RemindersDashboard
      reminders={reminders.map(serializeReminderForList)}
      deletedCount={deletedCount}
      deletedReminders={deletedReminders.map((reminder: any) => ({
        ...serializeReminderForList(reminder),
        deletedAt: reminder.deletedAt.toISOString(),
      }))}
    />
  );
}
