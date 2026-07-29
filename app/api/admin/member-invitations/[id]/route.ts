import { NextResponse } from "next/server";

import { requireAdminMemberApi } from "@/lib/admin-member-api";
import { memberErrorResponse } from "@/lib/member-domain-error";
import { revokeInvitation } from "@/lib/member-invitations";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminMemberApi();
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    await revokeInvitation(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const mapped = memberErrorResponse(error, "Unable to revoke invitation");
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
