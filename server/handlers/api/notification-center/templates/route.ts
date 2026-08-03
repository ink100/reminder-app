import { GET as getTemplates, POST as postTemplate } from "@/server/handlers/templates/route";
import { requireAdminApi } from "@/lib/admin-api";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  return getTemplates(request);
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  return postTemplate(request);
}
