import { type NextRequest, NextResponse } from "next/server";
import { verifyRegResponse } from "@/lib/webauthn";
import { requireApiSession } from "@/lib/auth";
import { ceremonyBrowserToken } from "@/lib/webauthn-cookie";

export async function POST(request: NextRequest) {
  const actor = await requireApiSession();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const result = await verifyRegResponse(actor.userId, body, ceremonyBrowserToken(request));
    return NextResponse.json(result);
  } catch (error) {
    console.error("注册验证失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "注册验证失败" },
      { status: 400 }
    );
  }
}
