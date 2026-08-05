import type { ApiError, ApiErrorPayload } from "../types/api";

const FALLBACK_ERROR = "请求失败，请稍后重试";

export function getApiErrorMessage(payload: unknown, fallback = FALLBACK_ERROR): string {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (!payload || typeof payload !== "object") return fallback;

  const body = payload as ApiErrorPayload;
  if (typeof body.error === "string" && body.error.trim()) return body.error;
  if (body.error && typeof body.error === "object" && typeof body.error.message === "string" && body.error.message.trim()) return body.error.message;
  if (typeof body.message === "string" && body.message.trim()) return body.message;
  if (typeof body.statusMessage === "string" && body.statusMessage.trim()) return body.statusMessage;
  if (Array.isArray(body.errors)) {
    const first = body.errors.find((item) => typeof item === "string" ? item.trim() : item?.message?.trim());
    if (typeof first === "string") return first;
    if (first?.message) return first.message;
  }
  if (body.data && body.data !== payload) return getApiErrorMessage(body.data, fallback);
  return fallback;
}

export function getApiErrorStatus(error: unknown): number {
  if (!error || typeof error !== "object") return 0;
  const value = error as { status?: number; statusCode?: number; response?: { status?: number } };
  return value.statusCode ?? value.status ?? value.response?.status ?? 0;
}

export function toApiError(error: unknown, fallback?: string): ApiError {
  const source = error as { data?: unknown; response?: { _data?: unknown } } | null;
  const data = source?.data ?? source?.response?._data;
  const result = new Error(getApiErrorMessage(data ?? (error instanceof Error ? error.message : error), fallback)) as ApiError;
  result.name = "ApiError";
  result.statusCode = getApiErrorStatus(error);
  result.data = data;
  return result;
}

export function isSafeReturnUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return false;
  if (value.includes("\\") || [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127;
  })) return false;
  try {
    const url = new URL(value, "https://local.invalid");
    return url.origin === "https://local.invalid";
  } catch {
    return false;
  }
}

export function safeReturnUrl(value: unknown, fallback = "/reminders"): string {
  return isSafeReturnUrl(value) ? value : fallback;
}

export function useApi() {
  const route = useRoute();
  const requestFetch = import.meta.server ? useRequestFetch() : $fetch;

  async function apiFetch<T>(url: string, options: Parameters<typeof $fetch<T>>[1] = {}): Promise<T> {
    try {
      return await requestFetch<T>(url, { credentials: "same-origin", ...options });
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.statusCode === 401) {
        const returnUrl = safeReturnUrl(route.fullPath);
        await navigateTo({ path: "/auth", query: { returnUrl } });
      }
      throw apiError;
    }
  }

  return { apiFetch };
}
