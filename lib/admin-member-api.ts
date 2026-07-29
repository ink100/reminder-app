import { requireAdminApi } from "@/lib/admin-api";

export async function requireAdminMemberApi() {
  return requireAdminApi();
}
