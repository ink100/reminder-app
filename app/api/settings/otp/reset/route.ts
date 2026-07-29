import { requireAdminApi } from "@/lib/admin-api";

export async function POST() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  return Response.json(
    { error: "多用户迁移期间已暂停 OTP 重置，请先保留现有验证器" },
    { status: 409 },
  );
}
