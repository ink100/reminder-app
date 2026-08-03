import { safeReturnUrl } from "../composables/useApi";

export default defineNuxtRouteMiddleware(async (to) => {
  const { fetchStatus } = useAuth();
  const status = await fetchStatus(true);
  if (!status.authenticated || !status.actor) return;

  const requested = Array.isArray(to.query.returnUrl) ? to.query.returnUrl[0] : to.query.returnUrl;
  return navigateTo(safeReturnUrl(requested), { replace: true });
});
