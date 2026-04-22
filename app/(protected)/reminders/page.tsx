import { prisma } from "@/lib/prisma";
import { RemindersDashboard } from "@/components/reminders/reminders-dashboard";

export default async function RemindersPage() {
  const reminders = await prisma.reminder.findMany({
    where: { deletedAt: null },
    orderBy: { dueAt: "asc" },
    take: 100,
  });

  return (
    <RemindersDashboard
      reminders={reminders.map((reminder) => ({
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
      }))}
    />
  );
}
