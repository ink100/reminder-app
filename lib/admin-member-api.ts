import { requireAdminApi } from "@/lib/admin-api";

export async function requireAdminMemberApi(request?: Request) {
  return requireAdminApi(request);
}
