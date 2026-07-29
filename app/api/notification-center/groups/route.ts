import type { NextRequest } from "next/server";

import { GET as getGroups, POST as postGroup } from "@/app/groups/route";
import { requireAdminApi } from "@/lib/admin-api";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  return getGroups();
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  return postGroup(request);
}
