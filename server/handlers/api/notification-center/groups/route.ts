import { GET as getGroups, POST as postGroup } from "@/server/handlers/groups/route";
import { requireAdminApi } from "@/lib/admin-api";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  return getGroups(request);
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  return postGroup(request);
}
