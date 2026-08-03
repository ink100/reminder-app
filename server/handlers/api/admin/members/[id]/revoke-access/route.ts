import { requireAdminMemberApi } from "@/lib/admin-member-api";
import { memberErrorResponse } from "@/lib/member-domain-error";
import { revokeMemberAccess } from "@/lib/member-management";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminMemberApi();
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    await revokeMemberAccess(auth.actor.userId, id);
    return Response.json({ success: true });
  } catch (error) {
    const mapped = memberErrorResponse(error, "Unable to revoke access");
    return Response.json(mapped.body, { status: mapped.status });
  }
}
