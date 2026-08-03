
import { getRegisteredCredentials } from "@/lib/webauthn";
import { requireApiSession } from "@/lib/auth";

export async function GET() {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const credentials = await getRegisteredCredentials(session.userId);
    return Response.json({ items: credentials });
  } catch (error) {
    console.error("获取凭证列表失败:", error);
    return Response.json(
      { error: "获取凭证列表失败" },
      { status: 500 }
    );
  }
}
