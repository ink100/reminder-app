
import { generateAuthOptions } from "@/lib/webauthn";
import { getOrCreateCeremonyBrowserToken, setCeremonyCookie } from "@/lib/webauthn-cookie";
import { getTrustedClientIp, reserveAnonymousAuthAttempt } from "@/lib/login-throttle";

export async function GET(request: Request) {
  try {
    if (!(await reserveAnonymousAuthAttempt("PASSKEY_OPTIONS", getTrustedClientIp(request.headers)))) {
      return Response.json({ error: "请求过于频繁" }, { status: 429 });
    }
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") === "hybrid" ? "hybrid" : "platform";
    const browserToken = getOrCreateCeremonyBrowserToken(request);
    const options = await generateAuthOptions(browserToken, mode);
    const response = Response.json(options);
    setCeremonyCookie(browserToken);
    return response;
  } catch (error) {
    console.error("生成认证选项失败:", error);
    return Response.json(
      { error: "生成认证选项失败" },
      { status: 500 }
    );
  }
}
