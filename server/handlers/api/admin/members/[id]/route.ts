import { ZodError } from "zod";

import { requireAdminMemberApi } from "@/lib/admin-member-api";
import { memberErrorResponse } from "@/lib/member-domain-error";
import { updateMember } from "@/lib/member-management";
import { updateMemberSchema } from "@/lib/validators/members";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminMemberApi();
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const patch = updateMemberSchema.parse(await request.json());
    return Response.json({ member: await updateMember(auth.actor.userId, id, patch) });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: "Invalid request", issues: error.issues }, { status: 400 });
    const mapped = memberErrorResponse(error, "Unable to update member");
    return Response.json(mapped.body, { status: mapped.status });
  }
}
