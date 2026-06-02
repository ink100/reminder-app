import { NextResponse } from "next/server";
import { getRegisteredCredentials } from "@/lib/webauthn";
import { requireApiSession } from "@/lib/auth";

export async function GET() {
  const session = await requireApiSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const credentials = await getRegisteredCredentials();
    return NextResponse.json({ items: credentials });
  } catch (error) {
    console.error("获取凭证列表失败:", error);
    return NextResponse.json(
      { error: "获取凭证列表失败" },
      { status: 500 }
    );
  }
}
