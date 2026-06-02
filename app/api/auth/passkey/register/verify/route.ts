import { type NextRequest, NextResponse } from "next/server";
import { verifyRegResponse } from "@/lib/webauthn";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await verifyRegResponse(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error("注册验证失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "注册验证失败" },
      { status: 400 }
    );
  }
}
