
import { generateRegOptions } from "@/lib/webauthn";
import { requireApiSession } from "@/lib/auth";
import { newCeremonyBrowserToken, setCeremonyCookie } from "@/lib/webauthn-cookie";

export async function GET(request: Request) {
  const actor = await requireApiSession();
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as "platform" | "cross-platform" | null;
    
    const browserToken = newCeremonyBrowserToken();
    const options = await generateRegOptions(actor.userId, browserToken, type || undefined);
    const response = Response.json(options);
    setCeremonyCookie(browserToken);
    return response;
  } catch (error) {
    console.error("生成注册选项失败:", error);
    return Response.json(
      { error: "生成注册选项失败" },
      { status: 500 }
    );
  }
}
