
import { generateInvitationPasskeyOptions } from "@/lib/invitation-passkey";
import { getOrCreateCeremonyBrowserToken, setCeremonyCookie } from "@/lib/webauthn-cookie";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const browserToken = getOrCreateCeremonyBrowserToken(request);
    const options = await generateInvitationPasskeyOptions(token, browserToken);
    const response = Response.json(options);
    setCeremonyCookie(browserToken);
    return response;
  } catch {
    return Response.json({ error: "Invitation is invalid or expired" }, { status: 400 });
  }
}
