import { type NextRequest, NextResponse } from "next/server";
import { generateAuthOptions } from "@/lib/webauthn";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") === "hybrid" ? "hybrid" : "platform";
    const options = await generateAuthOptions(mode);
    return NextResponse.json(options);
  } catch (error) {
    console.error("生成认证选项失败:", error);
    return NextResponse.json(
      { error: "生成认证选项失败" },
      { status: 500 }
    );
  }
}
