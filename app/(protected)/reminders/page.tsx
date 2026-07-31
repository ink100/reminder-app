/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabaseModels } from "@/lib/reminders/store";
import { RemindersDashboard } from "@/components/reminders/reminders-dashboard";

function serializeReminder(reminder: any) {
  return {
    id: reminder.id,
    title: reminder.title,
    description: reminder.description,
    activationCode: reminder.activationCode,
    activationContact: reminder.activationContact,
    dueAt: reminder.dueAt.toISOString(),
    priority: reminder.priority,
    category: reminder.category,
    completedAt: reminder.completedAt?.toISOString() ?? null,
    remindBeforeDays: reminder.remindBeforeDays,
  };
}

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
      reminders={reminders.map(serializeReminder)}
      deletedCount={deletedCount}
      deletedReminders={deletedReminders.map((reminder: any) => ({
        ...serializeReminder(reminder),
        deletedAt: reminder.deletedAt.toISOString(),
      }))}
    />
  );
}
