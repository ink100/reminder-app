export function normalizeClientKey(value: string) {
  return value.replace(/\s+/g, "").trim();
}

export function getLicenseFileNameFromContentDisposition(disposition: string | null, fallback = `license_${Date.now()}.key`) {
  if (!disposition) return fallback;

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ""));
  }

  const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (asciiMatch?.[1]) {
    return asciiMatch[1].trim();
  }

  return fallback;
}
