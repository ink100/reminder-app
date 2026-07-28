import { NextRequest, NextResponse } from "next/server";
import { generateRegOptions } from "@/lib/webauthn";
import { requireApiSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const actor = await requireApiSession();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as "platform" | "cross-platform" | null;
    
    const options = await generateRegOptions(actor.userId, type || undefined);
    return NextResponse.json(options);
  } catch (error) {
    console.error("生成注册选项失败:", error);
    return NextResponse.json(
      { error: "生成注册选项失败" },
      { status: 500 }
    );
  }
}
