import { MemberManagement } from "@/components/members/member-management";

export default function MembersPage() {
  return (
    <div className="min-w-0 space-y-6">
      <div>
        <p className="text-sm text-slate-500">管理员</p>
        <h1 className="text-2xl font-semibold text-slate-950">成员管理</h1>
      </div>
      <MemberManagement />
    </div>
  );
}
