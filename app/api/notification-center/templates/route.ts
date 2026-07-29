import type { NextRequest } from "next/server";

import { GET as getTemplates, POST as postTemplate } from "@/app/templates/route";
import { requireAdminApi } from "@/lib/admin-api";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  return getTemplates();
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  return postTemplate(request);
}
