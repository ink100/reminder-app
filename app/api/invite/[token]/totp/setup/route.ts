import { type NextRequest, NextResponse } from "next/server";

import { setupInvitationTotp } from "@/lib/invitation-acceptance";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    return NextResponse.json(await setupInvitationTotp(token));
  } catch {
    return NextResponse.json({ error: "Invitation is invalid or expired" }, { status: 400 });
  }
}
