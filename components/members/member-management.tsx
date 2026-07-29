"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import { AlertDialog } from "@/components/ui/alert-dialog";

type Member = {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "MEMBER";
  status: "INVITED" | "ACTIVE" | "DISABLED";
};

type Invitation = {
  id: string;
  targetUserId: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
};

export function MemberManagement() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/members");
    if (!response.ok) return;
    const result = await response.json();
    setMembers(result.members);
    setInvitations(result.invitations);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        displayName: form.get("displayName"),
        role: form.get("role"),
        expiresInHours: Number(form.get("expiresInHours")),
      }),
    });
    const result = await response.json();
    if (response.ok) {
      // The raw token is deliberately kept only in this transient response state.
      setInviteLink(`${window.location.origin}/invite/${result.invitation.token}`);
      formElement.reset();
      await load();
    } else setMessage(result.error || "邀请创建失败");
    setBusy(false);
  }

  async function patchMember(id: string, patch: { role?: Member["role"]; status?: "ACTIVE" | "DISABLED" }) {
    const response = await fetch(`/api/admin/members/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (response.ok) await load();
    else setMessage((await response.json()).error || "更新失败");
  }

  async function revokeAccess(id: string) {
    const response = await fetch(`/api/admin/members/${id}/revoke-access`, { method: "POST" });
    if (response.ok) setMessage("该成员的会话和受信任设备已撤销");
    else setMessage("撤销访问失败");
  }

  async function revokeInvitation(id: string) {
    const response = await fetch(`/api/admin/member-invitations/${id}`, { method: "DELETE" });
    if (response.ok) await load();
    else setMessage("撤销邀请失败");
  }

  return (
    <div className="space-y-6">
      <form onSubmit={invite} className="grid gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm">用户名<input required name="username" className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
        <label className="text-sm">显示名称<input required name="displayName" className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
        <label className="text-sm">角色<select name="role" defaultValue="MEMBER" className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="MEMBER">成员</option><option value="ADMIN">管理员</option></select></label>
        <label className="text-sm">有效小时<input required name="expiresInHours" type="number" min={1} max={720} defaultValue={72} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
        <button disabled={busy} className="min-h-11 self-end rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50">创建邀请</button>
      </form>

      {inviteLink ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium">邀请链接只显示一次，请立即复制。</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row"><code className="min-w-0 flex-1 break-all rounded bg-white p-2 text-xs">{inviteLink}</code><button onClick={async () => { await navigator.clipboard.writeText(inviteLink); setInviteLink(null); setMessage("邀请链接已复制；出于安全考虑不再显示"); }} className="min-h-11 rounded-lg bg-slate-900 px-4 text-sm text-white">复制一次</button></div>
        </div>
      ) : null}

      <div className="grid gap-3">
        {members.map((member) => {
          const invitation = invitations.find((item) => item.targetUserId === member.id && !item.consumedAt && !item.revokedAt);
          const protectedAdmin = member.id === "legacy-admin";
          return (
            <article key={member.id} className="grid gap-3 rounded-xl border border-slate-200 p-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center">
              <div className="min-w-0"><h2 className="font-medium">{member.displayName}</h2><p className="break-all text-sm text-slate-500">{member.username} · {member.status}{protectedAdmin ? " · legacy-admin" : ""}</p></div>
              <select aria-label={`修改 ${member.username} 的角色`} value={member.role} disabled={protectedAdmin} onChange={(event) => void patchMember(member.id, { role: event.target.value as Member["role"] })} className="min-h-11 rounded-lg border px-3"><option value="MEMBER">成员</option><option value="ADMIN">管理员</option></select>
              <select aria-label={`修改 ${member.username} 的状态`} value={member.status === "INVITED" ? "DISABLED" : member.status} disabled={protectedAdmin || member.status === "INVITED"} onChange={(event) => void patchMember(member.id, { status: event.target.value as "ACTIVE" | "DISABLED" })} className="min-h-11 rounded-lg border px-3"><option value="ACTIVE">启用</option><option value="DISABLED">停用</option></select>
              <div className="flex flex-wrap gap-2">
                <AlertDialog title="撤销成员访问？" description="将注销该成员的所有会话并撤销受信任设备，不会删除成员记录。" confirmLabel="撤销访问" onConfirm={() => void revokeAccess(member.id)} trigger={<button className="min-h-11 rounded-lg border border-red-200 px-3 text-sm text-red-600">撤销访问</button>} />
                {invitation ? <AlertDialog title="撤销邀请？" description="此邀请链接将立即失效，成员记录会保留。" confirmLabel="撤销邀请" onConfirm={() => void revokeInvitation(invitation.id)} trigger={<button className="min-h-11 rounded-lg border px-3 text-sm">撤销邀请</button>} /> : null}
              </div>
            </article>
          );
        })}
      </div>
      {message ? <p role="status" className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}
