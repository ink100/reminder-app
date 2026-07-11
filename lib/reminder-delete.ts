import { deleteFromR2 } from "@/lib/r2-storage";
import { attachmentStore } from "@/lib/reminders/store";
import { callRpc } from "@/lib/notification-center/store";

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
  deleteObject: (key: string) => Promise<void> = deleteFromR2
): Promise<void> {
  const failedKeys: string[] = [];

  for (const attachment of attachments) {
    try {
      await deleteObject(attachment.r2Key);
    } catch (error) {
      console.error("删除提醒附件 R2 文件失败:", {
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
  reminderId: string,
  deletedAt = new Date()
): Promise<{ attachmentCount: number }> {
  const attachments = await attachmentStore.findMany({
    where: { reminderId, deletedAt: null },
    select: { id: true, r2Key: true },
  });

  await deleteReminderAttachmentObjects(attachments as ReminderAttachmentForDelete[]);

  await callRpc<number>("soft_delete_reminder_with_attachments", {
    p_reminder_id: reminderId,
    p_deleted_at: deletedAt.toISOString(),
  });

  return { attachmentCount: attachments.length };
}
