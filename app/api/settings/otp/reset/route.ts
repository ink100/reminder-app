import { requireAdminApiSession } from "@/lib/auth";

export async function POST() {
  const session = await requireAdminApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json(
    { error: "多用户迁移期间已暂停 OTP 重置，请先保留现有验证器" },
    { status: 409 },
  );
}
