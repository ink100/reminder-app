import type { NextRequest } from "next/server";

import { GET as getChannels, POST as postChannel } from "@/app/channels/route";
import { requireAdminApi } from "@/lib/admin-api";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  return getChannels(request);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (auth.response) return auth.response;
  return postChannel(request);
}
