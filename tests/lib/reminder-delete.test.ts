import { describe, expect, it, vi } from "vitest";

import { deleteReminderAttachmentObjects, ReminderAttachmentDeleteError } from "@/lib/reminder-delete";

describe("deleteReminderAttachmentObjects", () => {
  it("deletes all reminder attachment objects from storage", async () => {
    const deleteObject = vi.fn<[string], Promise<void>>().mockResolvedValue(undefined);

    await deleteReminderAttachmentObjects(
      [
        { id: "att_1", r2Key: "files/a.png" },
        { id: "att_2", r2Key: "files/b.pdf" },
      ],
      deleteObject
    );

    expect(deleteObject).toHaveBeenCalledTimes(2);
    expect(deleteObject).toHaveBeenNthCalledWith(1, "files/a.png");
    expect(deleteObject).toHaveBeenNthCalledWith(2, "files/b.pdf");
  });

  it("reports failed keys when any storage deletion fails", async () => {
    const deleteObject = vi.fn<[string], Promise<void>>().mockImplementation(async (key) => {
      if (key === "files/b.pdf") {
        throw new Error("R2 unavailable");
      }
    });

    await expect(
      deleteReminderAttachmentObjects(
        [
          { id: "att_1", r2Key: "files/a.png" },
          { id: "att_2", r2Key: "files/b.pdf" },
        ],
        deleteObject
      )
    ).rejects.toMatchObject<Partial<ReminderAttachmentDeleteError>>({
      failedKeys: ["files/b.pdf"],
    });

    expect(deleteObject).toHaveBeenCalledTimes(2);
  });
});
