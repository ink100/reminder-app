import { deleteFromR2 } from "@/lib/r2-storage";

export async function cleanupR2Keys(
  keys: Array<string | null | undefined>,
  deleteObject: (key: string) => Promise<void> = deleteFromR2,
  maxAttempts = 3,
): Promise<string[]> {
  const failedKeys: string[] = [];
  for (const key of [...new Set(keys.filter((value): value is string => Boolean(value)))]) {
    let deleted = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await deleteObject(key);
        deleted = true;
        break;
      } catch (error) {
        if (attempt === maxAttempts) {
          console.error("R2 对象清理失败", { key, attempts: maxAttempts, error });
        }
      }
    }
    if (!deleted) failedKeys.push(key);
  }
  return failedKeys;
}
