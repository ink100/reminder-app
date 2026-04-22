export function normalizeOtpCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function isOtpCodeComplete(value: string) {
  return /^\d{6}$/.test(value);
}
