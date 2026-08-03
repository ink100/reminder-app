
import { generateInvitationPasskeyOptions } from "@/lib/invitation-passkey";
import { newCeremonyBrowserToken, setCeremonyCookie } from "@/lib/webauthn-cookie";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const browserToken = newCeremonyBrowserToken();
    const options = await generateInvitationPasskeyOptions(token, browserToken);
    const response = Response.json(options);
    setCeremonyCookie(browserToken);
    return response;
  } catch {
    return Response.json({ error: "Invitation is invalid or expired" }, { status: 400 });
  }
}
