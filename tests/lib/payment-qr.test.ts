import { describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  PAYMENT_QR_ATTACHMENT_TYPES,
  getPaymentQrLabel,
  validatePaymentQrUpload,
} from "@/lib/payment-qr";
import { normalizePaymentQrImage } from "@/lib/payment-qr-image";

describe("payment QR uploads", () => {
  it("accepts supported image uploads for WeChat and Alipay", () => {
    expect(validatePaymentQrUpload({ attachmentType: PAYMENT_QR_ATTACHMENT_TYPES.wechat, mimetype: "image/png", size: 1024 })).toBeNull();
    expect(validatePaymentQrUpload({ attachmentType: PAYMENT_QR_ATTACHMENT_TYPES.alipay, mimetype: "image/jpeg", size: 2048 })).toBeNull();
  });

  it("rejects unknown types, non-images, empty files and oversized images", () => {
    expect(validatePaymentQrUpload({ attachmentType: "other", mimetype: "image/png", size: 1 })).toBe("不支持的收款码类型");
    expect(validatePaymentQrUpload({ attachmentType: PAYMENT_QR_ATTACHMENT_TYPES.wechat, mimetype: "application/pdf", size: 1 })).toBe("只能上传图片文件");
    expect(validatePaymentQrUpload({ attachmentType: PAYMENT_QR_ATTACHMENT_TYPES.wechat, mimetype: "image/png", size: 0 })).toBe("图片内容为空");
    expect(validatePaymentQrUpload({ attachmentType: PAYMENT_QR_ATTACHMENT_TYPES.wechat, mimetype: "image/png", size: 10 * 1024 * 1024 + 1 })).toBe("图片不能超过 10MB");
  });

  it("provides source labels shown in the attachment gallery", () => {
    expect(getPaymentQrLabel(PAYMENT_QR_ATTACHMENT_TYPES.wechat)).toBe("微信收款二维码");
    expect(getPaymentQrLabel(PAYMENT_QR_ATTACHMENT_TYPES.alipay)).toBe("支付宝收款二维码");
    expect(getPaymentQrLabel(null)).toBeNull();
  });

  it("fully decodes and normalizes accepted images to safe PNG content", async () => {
    const jpeg = await sharp({ create: { width: 32, height: 24, channels: 3, background: "white" } }).jpeg().toBuffer();
    const normalized = await normalizePaymentQrImage(jpeg);

    expect(normalized.mimetype).toBe("image/png");
    expect(normalized.extension).toBe("png");
    expect(normalized.width).toBe(32);
    expect(normalized.height).toBe(24);
    expect(Array.from(normalized.buffer.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("rejects truncated, forged and excessive-dimension images", async () => {
    await expect(normalizePaymentQrImage(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).rejects.toThrow("无法解析二维码图片");
    await expect(normalizePaymentQrImage(Buffer.from("<script>alert(1)</script>"))).rejects.toThrow("无法解析二维码图片");
    const tooWide = await sharp({ create: { width: 4097, height: 1, channels: 3, background: "white" } }).png().toBuffer();
    await expect(normalizePaymentQrImage(tooWide)).rejects.toThrow("图片尺寸不能超过 4096×4096");
  });
});
