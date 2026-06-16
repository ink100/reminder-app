import { deleteFromGoogleDrive, isGoogleDriveConfigured, isGoogleDriveKey, uploadToGoogleDrive } from "@/lib/google-drive-storage";
import { deleteFromR2, uploadToR2 } from "@/lib/r2-storage";

export type AttachmentStorageUploadResult = {
  key: string;
  url: string;
  provider: "r2" | "google-drive";
};

export async function uploadAttachmentFile(
  file: Buffer,
  originalName: string,
  mimetype: string
): Promise<AttachmentStorageUploadResult> {
  try {
    const result = await uploadToR2(file, originalName, mimetype);
    return { ...result, provider: "r2" };
  } catch (r2Error) {
    if (!isGoogleDriveConfigured()) {
      throw r2Error;
    }

    console.warn("R2 上传失败，尝试使用 Google Drive 后备存储:", r2Error);
    const result = await uploadToGoogleDrive(file, originalName, mimetype);
    return { ...result, provider: "google-drive" };
  }
}

export async function deleteAttachmentFile(key: string): Promise<void> {
  if (isGoogleDriveKey(key)) {
    await deleteFromGoogleDrive(key);
    return;
  }

  await deleteFromR2(key);
}
