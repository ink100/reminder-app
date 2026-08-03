export default defineNuxtRouteMiddleware(async () => {
  const { fetchStatus } = useAuth();
  const status = await fetchStatus();
  if (status.authenticated && status.actor?.role === "ADMIN") return;
  return navigateTo("/reminders", { replace: true });
});