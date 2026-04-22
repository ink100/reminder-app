import { getCurrentSession } from "@/lib/session";
import { ensureAppSettings } from "@/lib/bootstrap-settings";

export async function GET() {
  const [settings, session] = await Promise.all([ensureAppSettings(), getCurrentSession()]);

  return Response.json({
    otpConfigured: Boolean(settings.otpSecretEncrypted),
    authenticated: Boolean(session),
  });
}
