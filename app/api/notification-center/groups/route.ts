import type { NextRequest } from "next/server";

import { GET as getGroups, POST as postGroup } from "@/app/groups/route";
import { requireAdminApi } from "@/lib/admin-api";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  return getGroups(request);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  return postGroup(request);
}
