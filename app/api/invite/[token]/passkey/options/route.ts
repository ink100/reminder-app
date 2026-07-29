import { type NextRequest, NextResponse } from "next/server";

import { generateInvitationPasskeyOptions } from "@/lib/invitation-passkey";
import { newCeremonyBrowserToken, setCeremonyCookie } from "@/lib/webauthn-cookie";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const browserToken = newCeremonyBrowserToken();
    const options = await generateInvitationPasskeyOptions(token, browserToken);
    const response = NextResponse.json(options);
    setCeremonyCookie(response, browserToken);
    return response;
  } catch {
    return NextResponse.json({ error: "Invitation is invalid or expired" }, { status: 400 });
  }
}
