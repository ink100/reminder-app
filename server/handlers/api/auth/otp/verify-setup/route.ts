import { requireAdminApi } from "@/lib/admin-api";

const LEGACY_TOTP_SETUP_UNAVAILABLE = { error: "Legacy TOTP setup is unavailable" };

export async function POST() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  return Response.json(LEGACY_TOTP_SETUP_UNAVAILABLE, { status: 410 });
}
