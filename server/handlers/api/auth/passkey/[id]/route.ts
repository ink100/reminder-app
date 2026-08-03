
import { deleteCredential, LastAuthenticationFactorError } from "@/lib/webauthn";
import { requireApiSession } from "@/lib/auth";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    await deleteCredential(session.userId, id);
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof LastAuthenticationFactorError) {
      return Response.json({ error: "无法删除唯一登录凭证" }, { status: 409 });
    }
    console.error("删除凭证失败:", error);
    return Response.json(
      { error: "删除凭证失败" },
      { status: 500 }
    );
  }
}
