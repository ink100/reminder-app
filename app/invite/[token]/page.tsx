import { InvitationEnrollment } from "@/components/auth/invitation-enrollment";
import { getInvitationPublicDetails } from "@/lib/invitation-acceptance";

export const dynamic = "force-dynamic";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await getInvitationPublicDetails(token).catch(() => null);

  if (!invitation) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><section className="rounded-2xl bg-white p-8 text-center shadow-sm"><h1 className="text-xl font-semibold">邀请无效或已过期</h1><p className="mt-2 text-sm text-slate-600">请联系管理员获取新的邀请。</p></section></main>;
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
    <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-500">家庭成员邀请</p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-950">欢迎，{invitation.displayName}</h1>
      <p className="mt-2 mb-6 text-sm text-slate-600">请选择一种独立的首次登录方式。激活后即可进入系统。</p>
      <InvitationEnrollment token={token} />
    </section>
  </main>;
}
