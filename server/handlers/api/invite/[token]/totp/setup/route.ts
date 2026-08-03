
import { setupInvitationTotp } from "@/lib/invitation-acceptance";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    return Response.json(await setupInvitationTotp(token));
  } catch {
    return Response.json({ error: "Invitation is invalid or expired" }, { status: 400 });
  }
}
