import { safeReturnUrl } from "../composables/useApi";

export default defineNuxtRouteMiddleware(async (to) => {
  const { fetchStatus } = useAuth();
  const status = await fetchStatus(true);
  if (status.authenticated && status.actor) return;

  const returnUrl = safeReturnUrl(to.fullPath);
  return navigateTo({ path: "/auth", query: { returnUrl } }, { replace: true });
});
