import { type NextRequest, NextResponse } from "next/server";
import { deleteCredential } from "@/lib/webauthn";
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
    await deleteCredential(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除凭证失败:", error);
    return NextResponse.json(
      { error: "删除凭证失败" },
      { status: 500 }
    );
  }
}
