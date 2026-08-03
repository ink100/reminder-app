import type { AuthStatusResponse } from "../types/api";

export function useAuth() {
  const status = useState<AuthStatusResponse | null>("auth-status", () => null);
  const pending = useState("auth-status-pending", () => false);
  const actor = computed(() => status.value?.actor ?? null);
  const authenticated = computed(() => status.value?.authenticated === true && actor.value !== null);

  async function fetchStatus(force = false): Promise<AuthStatusResponse> {
    if (status.value && !force) return status.value;
    pending.value = true;
    try {
      if (import.meta.server) {
        status.value = await useRequestFetch()<AuthStatusResponse>("/api/auth/status", {
          credentials: "same-origin",
        });
      } else {
        status.value = await $fetch<AuthStatusResponse>("/api/auth/status", {
          credentials: "same-origin",
        });
      }
      return status.value;
    } catch {
      status.value = { otpConfigured: false, authenticated: false, actor: null };
      return status.value;
    } finally {
      pending.value = false;
    }
  }

  function clearAuth() {
    status.value = { otpConfigured: status.value?.otpConfigured ?? false, authenticated: false, actor: null };
  }

  async function logout() {
    try {
      await $fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      clearAuth();
      await navigateTo("/auth");
    }
  }

  return { status, actor, authenticated, pending, fetchStatus, clearAuth, logout };
}
