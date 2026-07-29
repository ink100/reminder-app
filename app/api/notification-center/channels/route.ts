import type { NextRequest } from "next/server";

import { GET as getChannels, POST as postChannel } from "@/app/channels/route";
import { requireAdminApi } from "@/lib/admin-api";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  return getChannels();
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  return postChannel(request);
}
