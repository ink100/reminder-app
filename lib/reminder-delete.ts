import { deleteAttachmentFile } from "@/lib/attachment-storage";
import type { prisma as prismaClient } from "@/lib/prisma";

type PrismaClient = typeof prismaClient;

type ReminderAttachmentForDelete = {
  id: string;
  r2Key: string;
};

export class ReminderAttachmentDeleteError extends Error {
  constructor(public readonly failedKeys: string[]) {
    super(`删除提醒附件文件失败：${failedKeys.join(", ")}`);
    this.name = "ReminderAttachmentDeleteError";
  }
}

export async function deleteReminderAttachmentObjects(
  attachments: ReminderAttachmentForDelete[],
  deleteObject: (key: string) => Promise<void> = deleteAttachmentFile
): Promise<void> {
  const failedKeys: string[] = [];

  for (const attachment of attachments) {
    try {
      await deleteObject(attachment.r2Key);
    } catch (error) {
      console.error("删除提醒附件存储文件失败:", {
        attachmentId: attachment.id,
        r2Key: attachment.r2Key,
        error,
      });
      failedKeys.push(attachment.r2Key);
    }
  }

  if (failedKeys.length > 0) {
    throw new ReminderAttachmentDeleteError(failedKeys);
  }
}

export async function softDeleteReminderWithAttachments(
  db: PrismaClient,
  reminderId: string,
  deletedAt = new Date()
): Promise<{ attachmentCount: number }> {
  const attachments = await db.attachment.findMany({
    where: { reminderId, deletedAt: null },
    select: { id: true, r2Key: true },
  });

  await deleteReminderAttachmentObjects(attachments);

  await db.$transaction([
    db.attachment.updateMany({
      where: { reminderId, deletedAt: null },
      data: { deletedAt },
    }),
    db.reminder.update({
      where: { id: reminderId },
      data: { deletedAt },
    }),
  ]);

  return { attachmentCount: attachments.length };
}
