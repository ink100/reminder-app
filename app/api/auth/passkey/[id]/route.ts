import { type NextRequest, NextResponse } from "next/server";
import { deleteCredential, LastAuthenticationFactorError } from "@/lib/webauthn";
import { requireApiSession } from "@/lib/auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    await deleteCredential(session.userId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof LastAuthenticationFactorError) {
      return NextResponse.json({ error: "无法删除唯一登录凭证" }, { status: 409 });
    }
    console.error("删除凭证失败:", error);
    return NextResponse.json(
      { error: "删除凭证失败" },
      { status: 500 }
    );
  }
}
