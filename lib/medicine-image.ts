import sharp from "sharp";

const SUPPORTED_FORMATS = new Set(["png", "jpeg", "webp", "gif"]);
const MAX_DIMENSION = 4096;
const MAX_PIXELS = 16_777_216;

export async function normalizeMedicineImage(input: Buffer) {
  try {
    const image = sharp(input, {
      animated: false,
      failOn: "warning",
      limitInputPixels: MAX_PIXELS,
    });
    const metadata = await image.metadata();
    if (!metadata.format || !SUPPORTED_FORMATS.has(metadata.format)) {
      throw new Error("仅支持 PNG、JPG、WebP、GIF 图片");
    }
    if (!metadata.width || !metadata.height) throw new Error("无法读取图片尺寸");
    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
      throw new Error(`图片尺寸不能超过 ${MAX_DIMENSION}×${MAX_DIMENSION}`);
    }
    if ((metadata.pages ?? 1) > 1) throw new Error("不支持动态或多帧药品图片");

    const buffer = await image.png({ compressionLevel: 9 }).toBuffer();
    return {
      buffer,
      mimetype: "image/png" as const,
      extension: "png" as const,
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    if (error instanceof Error && (
      error.message.startsWith("图片尺寸不能超过") ||
      error.message === "不支持动态或多帧药品图片" ||
      error.message === "仅支持 PNG、JPG、WebP、GIF 图片"
    )) {
      throw error;
    }
    throw new Error("无法解析药品图片，请上传有效的 PNG、JPG、WebP 或 GIF 图片");
  }
}
