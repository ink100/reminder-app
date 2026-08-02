import type { NextRequest } from "next/server";

import { GET as getTemplates, POST as postTemplate } from "@/app/templates/route";
import { requireAdminApi } from "@/lib/admin-api";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  return getTemplates(request);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  return postTemplate(request);
}
