import { type NextRequest, NextResponse } from "next/server";
import { verifyAuthResponse } from "@/lib/webauthn";
import { createSession } from "@/lib/session";
import { createTrustedDevice } from "@/lib/trusted-device";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rememberDevice, ...authResponse } = body;
    const result = await verifyAuthResponse(authResponse);

    if (result.verified) {
      // 获取客户端信息
      const ipAddress = request.headers.get("x-forwarded-for") || 
                        request.headers.get("x-real-ip") || 
                        "unknown";
      const userAgent = request.headers.get("user-agent") || "unknown";

      // 创建会话
      await createSession(result.userId, "passkey", ipAddress, userAgent);

      if (rememberDevice) {
        await createTrustedDevice(result.userId, ipAddress, userAgent);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("认证验证失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "认证验证失败" },
      { status: 400 }
    );
  }
}
