import { notFound } from "next/navigation";

import { ReminderForm } from "@/components/reminders/reminder-form";
import { prisma } from "@/lib/prisma";

export default async function EditReminderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [reminder, attachments] = await Promise.all([
    prisma.reminder.findUnique({ where: { id } }),
    prisma.attachment.findMany({
      where: { reminderId: id, deletedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!reminder || reminder.deletedAt) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">编辑提醒</p>
        <h1 className="text-2xl font-semibold text-slate-950">更新提醒事项</h1>
      </div>
      <ReminderForm
        mode="edit"
        defaultValues={{
          id: reminder.id,
          title: reminder.title,
          description: reminder.description ?? "",
          activationCode: reminder.activationCode ?? "",
          activationContact: reminder.activationContact ?? "",
          dueAt: reminder.dueAt.toISOString().slice(0, 16),
          category: reminder.category ?? "",
          priority: (reminder.priority as "low" | "medium" | "high") ?? "medium",
          remindBeforeDays: reminder.remindBeforeDays,
          remindBeforeHours: reminder.remindBeforeHours,
          overdueRemindEnabled: reminder.overdueRemindEnabled,
          recurrenceType: (reminder.recurrenceType as "daily" | "weekly" | "monthly" | null) ?? null,
          recurrenceInterval: reminder.recurrenceInterval ?? 1,
        }}
        attachments={attachments.map((a) => ({
          id: a.id,
          originalName: a.originalName,
          mimetype: a.mimetype,
          size: a.size,
          url: a.url,
          createdAt: a.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
