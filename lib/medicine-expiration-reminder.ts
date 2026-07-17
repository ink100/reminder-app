import type { MedicineRecord } from "@/lib/medicines";
import { medicineStore, reminderStore } from "@/lib/reminders/store";

function buildDueAt(expiresAt: Date, daysBefore: number) {
  const dueAt = new Date(expiresAt);
  dueAt.setDate(dueAt.getDate() - daysBefore);
  return dueAt;
}

function buildDescription(medicine: Pick<MedicineRecord, "name" | "expiresAt" | "locationText" | "quantityRemaining" | "unit">) {
  const parts = [`药品「${medicine.name}」即将到期，请检查是否继续保留或及时处理。`];
  if (medicine.expiresAt) parts.push(`过期日期：${medicine.expiresAt.toISOString().slice(0, 10)}`);
  if (medicine.quantityRemaining !== null) parts.push(`剩余量：${medicine.quantityRemaining}${medicine.unit}`);
  if (medicine.locationText) parts.push(`位置：${medicine.locationText}`);
  return parts.join("\n");
}

export async function syncMedicineExpirationReminder(medicine: MedicineRecord) {
  if (!medicine.expiresAt || medicine.deletedAt) {
    if (medicine.expirationReminderId) {
      await reminderStore.update({ where: { id: medicine.expirationReminderId }, data: { deletedAt: new Date() } }).catch(() => null);
      await medicineStore.update({ where: { id: medicine.id }, data: { expirationReminderId: null } });
    }
    return null;
  }

  const daysBefore = medicine.expirationReminderDays ?? 30;
  const dueAt = buildDueAt(medicine.expiresAt, daysBefore);
  const now = new Date();
  if (dueAt.getTime() < now.getTime()) dueAt.setTime(now.getTime());

  const data = {
    title: `药品过期提醒：${medicine.name}`,
    description: buildDescription(medicine),
    dueAt,
    priority: "medium",
    category: "日常生活",
    remindBeforeDays: 0,
    remindBeforeHours: 24,
    overdueRemindEnabled: true,
    recurrenceType: null,
    recurrenceInterval: null,
    completedAt: null,
  };

  if (medicine.expirationReminderId) {
    const existing = await reminderStore.findUnique({ where: { id: medicine.expirationReminderId } });
    if (existing && !existing.deletedAt) return reminderStore.update({ where: { id: medicine.expirationReminderId }, data });
  }

  const reminder = await reminderStore.create({ data: { ...data, upcomingNotifiedAt: null, overdueNotifiedAt: null } });
  await medicineStore.update({ where: { id: medicine.id }, data: { expirationReminderId: reminder.id } });
  return reminder;
}
