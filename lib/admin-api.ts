import { requireApiSession } from "@/lib/auth";
import { adminApiAuthorizationStatus } from "@/lib/member-api-auth";

/** Central browser API guard: anonymous is 401, every non-ADMIN role is 403. */
export async function requireAdminApi(request?: Request) {
  const actor = await requireApiSession(request);
  const status = adminApiAuthorizationStatus(actor);
  if (status) {
    return {
      actor: null,
      response: Response.json(
        { error: status === 401 ? "Unauthorized" : "Forbidden" },
        { status },
      ),
    };
  }
  return { actor: actor!, response: null };
}
