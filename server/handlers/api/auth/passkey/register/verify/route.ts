
import { verifyRegResponse } from "@/lib/webauthn";
import { requireApiSession } from "@/lib/auth";
import { ceremonyBrowserToken } from "@/lib/webauthn-cookie";

export async function POST(request: Request) {
  const actor = await requireApiSession();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const { ceremonyId, ...registrationResponse } = body;
    if (typeof ceremonyId !== "string" || !ceremonyId) throw new Error("WebAuthn ceremony is invalid, expired, or used");
    const result = await verifyRegResponse(actor.userId, registrationResponse, ceremonyBrowserToken(request), ceremonyId);
    return Response.json(result);
  } catch (error) {
    console.error("注册验证失败:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "注册验证失败" },
      { status: 400 }
    );
  }
}
