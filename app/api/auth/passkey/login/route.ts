import { type NextRequest, NextResponse } from "next/server";
import { generateAuthOptions } from "@/lib/webauthn";
import { newCeremonyBrowserToken, setCeremonyCookie } from "@/lib/webauthn-cookie";
import { getTrustedClientIp, reserveAnonymousAuthAttempt } from "@/lib/login-throttle";

export async function GET(request: NextRequest) {
  try {
    if (!(await reserveAnonymousAuthAttempt("PASSKEY_OPTIONS", getTrustedClientIp(request.headers)))) {
      return NextResponse.json({ error: "请求过于频繁" }, { status: 429 });
    }
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") === "hybrid" ? "hybrid" : "platform";
    const browserToken = newCeremonyBrowserToken();
    const options = await generateAuthOptions(browserToken, mode);
    const response = NextResponse.json(options);
    setCeremonyCookie(response, browserToken);
    return response;
  } catch (error) {
    console.error("生成认证选项失败:", error);
    return NextResponse.json(
      { error: "生成认证选项失败" },
      { status: 500 }
    );
  }
}
