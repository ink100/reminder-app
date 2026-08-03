<script setup lang="ts">
import { ElMessage, ElMessageBox } from "element-plus";

interface Member {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "MEMBER";
  status: "INVITED" | "ACTIVE" | "DISABLED";
}
interface Invitation {
  id: string;
  targetUserId: string;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
}

const props = defineProps<{ actorId: string }>();
const { apiFetch } = useApi();
const members = ref<Member[]>([]);
const invitations = ref<Invitation[]>([]);
const loading = ref(true);
const busy = ref(false);
const actionId = ref<string | null>(null);
const inviteLink = ref("");
const form = reactive({ username: "", displayName: "", role: "MEMBER" as Member["role"], expiresInHours: 72 });
const activeAdminCount = computed(() => members.value.filter((m) => m.role === "ADMIN" && m.status === "ACTIVE").length);

function isProtected(member: Member) { return member.id === "legacy-admin"; }
function isSelf(member: Member) { return member.id === props.actorId; }
function isLastAdmin(member: Member) { return member.role === "ADMIN" && member.status === "ACTIVE" && activeAdminCount.value <= 1; }
function activeInvitation(member: Member) {
  return invitations.value.find((item) => item.targetUserId === member.id && !item.consumedAt && !item.revokedAt);
}
function errorText(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }

async function load() {
  loading.value = true;
  try {
    const result = await apiFetch<{ members?: Member[]; invitations?: Invitation[] }>("/api/admin/members");
    members.value = result.members ?? [];
    invitations.value = result.invitations ?? [];
  } catch (error) { ElMessage.error(errorText(error, "加载成员失败")); }
  finally { loading.value = false; }
}

async function invite() {
  if (!form.username.trim() || !form.displayName.trim()) return;
  busy.value = true;
  try {
    const result = await apiFetch<{ invitation: { token: string } }>("/api/admin/members", {
      method: "POST", body: { ...form, username: form.username.trim(), displayName: form.displayName.trim() },
    });
    inviteLink.value = `${window.location.origin}/invite/${result.invitation.token}`;
    Object.assign(form, { username: "", displayName: "", role: "MEMBER", expiresInHours: 72 });
    await load();
  } catch (error) { ElMessage.error(errorText(error, "邀请创建失败")); }
  finally { busy.value = false; }
}

async function copyInvitation() {
  try {
    await navigator.clipboard.writeText(inviteLink.value);
    inviteLink.value = "";
    ElMessage.success("邀请链接已复制；出于安全考虑不再显示");
  } catch { ElMessage.error("复制失败，请手动复制链接"); }
}

async function updateMember(member: Member, patch: { role?: Member["role"]; status?: "ACTIVE" | "DISABLED" }) {
  const label = patch.role ? `将 ${member.displayName} 的角色改为${patch.role === "ADMIN" ? "管理员" : "成员"}` : `${patch.status === "DISABLED" ? "停用" : "启用"} ${member.displayName}`;
  try {
    await ElMessageBox.confirm(`${label}？权限与会话仍会由服务器再次校验。`, "修改成员权限", {
      type: patch.status === "DISABLED" || patch.role === "MEMBER" ? "warning" : "info",
      confirmButtonText: "确认修改", cancelButtonText: "取消",
    });
  } catch { await load(); return; }
  actionId.value = member.id;
  try {
    await apiFetch(`/api/admin/members/${member.id}`, { method: "PATCH", body: patch });
    ElMessage.success("成员信息已更新");
  } catch (error) { ElMessage.error(errorText(error, "更新失败")); }
  finally { actionId.value = null; await load(); }
}

async function revokeAccess(member: Member) {
  try {
    await ElMessageBox.confirm("将注销该成员的所有会话并撤销可信设备，不会删除成员记录。", `撤销 ${member.displayName} 的访问？`, {
      type: "error", confirmButtonText: "撤销访问", cancelButtonText: "取消", confirmButtonClass: "el-button--danger",
    });
  } catch { return; }
  actionId.value = member.id;
  try {
    await apiFetch(`/api/admin/members/${member.id}/revoke-access`, { method: "POST" });
    ElMessage.success("该成员的会话和可信设备已撤销");
    await load();
  } catch (error) { ElMessage.error(errorText(error, "撤销访问失败")); }
  finally { actionId.value = null; }
}

async function revokeInvitation(invitation: Invitation | undefined) {
  if (!invitation) return;
  try {
    await ElMessageBox.confirm("邀请链接将立即失效，成员记录会保留。", "撤销邀请？", {
      type: "warning", confirmButtonText: "撤销邀请", cancelButtonText: "取消",
    });
  } catch { return; }
  actionId.value = invitation.targetUserId;
  try {
    await apiFetch(`/api/admin/member-invitations/${invitation.id}`, { method: "DELETE" });
    ElMessage.success("邀请已撤销"); await load();
  } catch (error) { ElMessage.error(errorText(error, "撤销邀请失败")); }
  finally { actionId.value = null; }
}

onMounted(load);
</script>

<template>
  <div class="member-management">
    <el-card shadow="never">
      <template #header><strong>邀请成员</strong></template>
      <el-form label-position="top" class="invite-form" @submit.prevent="invite">
        <el-form-item label="用户名" required><el-input v-model="form.username" autocomplete="off" /></el-form-item>
        <el-form-item label="显示名称" required><el-input v-model="form.displayName" /></el-form-item>
        <el-form-item label="角色"><el-select v-model="form.role"><el-option label="成员" value="MEMBER" /><el-option label="管理员" value="ADMIN" /></el-select></el-form-item>
        <el-form-item label="有效小时"><el-input-number v-model="form.expiresInHours" :min="1" :max="720" /></el-form-item>
        <el-form-item class="submit-item"><el-button native-type="submit" type="primary" :loading="busy">创建邀请</el-button></el-form-item>
      </el-form>
    </el-card>

    <el-alert v-if="inviteLink" title="邀请链接只显示一次，请立即复制" type="warning" :closable="false" show-icon>
      <div class="invite-link"><code>{{ inviteLink }}</code><el-button type="primary" @click="copyInvitation">复制一次</el-button></div>
    </el-alert>

    <el-card shadow="never">
      <template #header><div class="list-header"><strong>成员列表</strong><el-tag>{{ members.length }} 人</el-tag></div></template>
      <el-skeleton v-if="loading" :rows="4" animated />
      <el-empty v-else-if="members.length === 0" description="暂无成员" />
      <div v-else class="member-list">
        <article v-for="member in members" :key="member.id" class="member-row">
          <div class="identity"><strong>{{ member.displayName }}</strong><p>{{ member.username }}</p><el-tag size="small" :type="member.status === 'ACTIVE' ? 'success' : member.status === 'DISABLED' ? 'danger' : 'warning'">{{ member.status }}</el-tag><el-tag v-if="isSelf(member)" size="small">当前账户</el-tag><el-tag v-if="isProtected(member)" size="small" type="info">受保护</el-tag></div>
          <el-select :model-value="member.role" :aria-label="`修改 ${member.username} 的角色`" :disabled="isProtected(member) || isSelf(member) || isLastAdmin(member) || actionId === member.id" @change="updateMember(member, { role: $event as Member['role'] })"><el-option label="成员" value="MEMBER" /><el-option label="管理员" value="ADMIN" /></el-select>
          <el-select :model-value="member.status === 'INVITED' ? 'DISABLED' : member.status" :aria-label="`修改 ${member.username} 的状态`" :disabled="isProtected(member) || isSelf(member) || isLastAdmin(member) || member.status === 'INVITED' || actionId === member.id" @change="updateMember(member, { status: $event as 'ACTIVE' | 'DISABLED' })"><el-option label="启用" value="ACTIVE" /><el-option label="停用" value="DISABLED" /></el-select>
          <div class="row-actions">
            <el-tooltip :disabled="!isSelf(member)" content="不能撤销当前账户的访问"><span><el-button type="danger" plain :disabled="isSelf(member) || isProtected(member) || isLastAdmin(member)" :loading="actionId === member.id" @click="revokeAccess(member)">撤销访问</el-button></span></el-tooltip>
            <el-button v-if="activeInvitation(member)" :disabled="actionId === member.id" @click="revokeInvitation(activeInvitation(member))">撤销邀请</el-button>
          </div>
        </article>
      </div>
      <el-alert title="界面仅按 ADMIN 权限展示操作；所有权限、自锁及最后管理员保护均由后端再次强制校验。" type="info" :closable="false" show-icon />
    </el-card>
  </div>
</template>

<style scoped>
.member-management, .member-list { display: grid; gap: 16px; }
.invite-form { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; align-items: end; }
.invite-form .el-form-item { margin-bottom: 0; }
.submit-item :deep(.el-form-item__content) { align-items: end; }
.invite-link { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
.invite-link code { flex: 1; overflow-wrap: anywhere; padding: 8px; background: var(--el-fill-color-blank); }
.list-header, .row-actions { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
.member-row { display: grid; grid-template-columns: minmax(180px, 1fr) 130px 130px auto; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; }
.identity p { margin: 4px 0 8px; color: var(--el-text-color-secondary); overflow-wrap: anywhere; }
.identity .el-tag { margin-right: 5px; }
.el-card > :deep(.el-card__body) > .el-alert { margin-top: 16px; }
@media (max-width: 900px) { .invite-form { grid-template-columns: repeat(2, minmax(0, 1fr)); } .member-row { grid-template-columns: 1fr; align-items: stretch; } .row-actions { justify-content: flex-start; flex-wrap: wrap; } }
@media (max-width: 520px) { .invite-form { grid-template-columns: 1fr; } .invite-link { align-items: stretch; flex-direction: column; } }
</style>
