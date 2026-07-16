export const PAYMENT_QR_ATTACHMENT_TYPES = {
  wechat: "wechat_payment_qr",
  alipay: "alipay_payment_qr",
} as const;

export type PaymentQrAttachmentType = (typeof PAYMENT_QR_ATTACHMENT_TYPES)[keyof typeof PAYMENT_QR_ATTACHMENT_TYPES];

const labels: Record<PaymentQrAttachmentType, string> = {
  [PAYMENT_QR_ATTACHMENT_TYPES.wechat]: "微信收款二维码",
  [PAYMENT_QR_ATTACHMENT_TYPES.alipay]: "支付宝收款二维码",
};

export function isPaymentQrAttachmentType(value: string | null | undefined): value is PaymentQrAttachmentType {
  return value === PAYMENT_QR_ATTACHMENT_TYPES.wechat || value === PAYMENT_QR_ATTACHMENT_TYPES.alipay;
}

export function getPaymentQrLabel(value: string | null | undefined): string | null {
  return isPaymentQrAttachmentType(value) ? labels[value] : null;
}

export function validatePaymentQrUpload(input: { attachmentType: string | null | undefined; mimetype: string; size: number }): string | null {
  if (!isPaymentQrAttachmentType(input.attachmentType)) return "不支持的收款码类型";
  if (!input.mimetype.startsWith("image/")) return "只能上传图片文件";
  if (input.size <= 0) return "图片内容为空";
  if (input.size > 10 * 1024 * 1024) return "图片不能超过 10MB";
  return null;
}
