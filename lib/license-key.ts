export function normalizeClientKey(value: string) {
  return value.replace(/\s+/g, "").trim();
}
