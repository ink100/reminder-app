import { NextRequest, NextResponse } from "next/server";
import { generateRegOptions } from "@/lib/webauthn";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as "platform" | "cross-platform" | null;
    
    const options = await generateRegOptions(type || undefined);
    return NextResponse.json(options);
  } catch (error) {
    console.error("生成注册选项失败:", error);
    return NextResponse.json(
      { error: "生成注册选项失败" },
      { status: 500 }
    );
  }
}
