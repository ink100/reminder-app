<script setup lang="ts">
import { ElMessage, ElMessageBox } from "element-plus";

interface Credential {
  id: string;
  credentialId: string;
  deviceName: string | null;
  authenticatorType: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const props = defineProps<{ otpConfigured?: boolean }>();
const emit = defineEmits<{ count: [value: number] }>();
const { apiFetch } = useApi();
const credentials = ref<Credential[]>([]);
const loading = ref(true);
const deletingId = ref<string | null>(null);
const registering = ref(false);
const errorMessage = ref("");

const isLastFactor = computed(() => !props.otpConfigured && credentials.value.length <= 1);

function formatDate(value: string | null) {
  if (!value) return "从未使用";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const result = await apiFetch<{ items?: Credential[] }>("/api/auth/passkey/list");
    credentials.value = result.items ?? [];
    emit("count", credentials.value.length);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "获取通行密匙失败";
  } finally {
    loading.value = false;
  }
}

async function remove(credential: Credential) {
  if (isLastFactor.value) {
    ElMessage.warning("无法删除唯一登录凭证，请先添加其他验证方式");
    return;
  }
  try {
    await ElMessageBox.confirm(
      `删除“${credential.deviceName || "通行密匙"}”后将无法再用它登录，是否继续？`,
      "删除通行密匙",
      { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning", confirmButtonClass: "el-button--danger" },
    );
  } catch { return; }

  deletingId.value = credential.id;
  try {
    await apiFetch<{ success: boolean }>(`/api/auth/passkey/${credential.id}`, { method: "DELETE" });
    credentials.value = credentials.value.filter(({ id }) => id !== credential.id);
    emit("count", credentials.value.length);
    ElMessage.success("通行密匙已删除");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "删除通行密匙失败");
    await load();
  } finally {
    deletingId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <el-card shadow="never" class="security-card">
    <template #header>
      <div class="card-header">
        <div>
          <h2>通行密匙</h2>
          <p>使用生物识别、手机或安全密钥进行免密码登录。</p>
        </div>
        <el-button type="primary" @click="registering = !registering">{{ registering ? "取消" : "添加通行密匙" }}</el-button>
      </div>
    </template>

    <PasskeyRegister v-if="registering" class="register" @success="registering = false; load()" />
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" :closable="false" show-icon />
    <el-skeleton v-if="loading" :rows="2" animated />
    <el-empty v-else-if="credentials.length === 0" description="还没有通行密匙" />
    <div v-else class="credential-list">
      <div v-for="credential in credentials" :key="credential.id" class="credential-row">
        <div>
          <strong>{{ credential.deviceName || "通行密匙" }}</strong>
          <p>{{ credential.authenticatorType === "platform" ? "设备内置" : "外部设备" }} · 添加于 {{ formatDate(credential.createdAt) }}</p>
          <p>最后使用：{{ formatDate(credential.lastUsedAt) }}</p>
        </div>
        <el-tooltip :disabled="!isLastFactor" content="这是唯一登录凭证，请先添加其他验证方式">
          <span><el-button type="danger" plain :disabled="isLastFactor" :loading="deletingId === credential.id" @click="remove(credential)">删除</el-button></span>
        </el-tooltip>
      </div>
      <el-alert v-if="isLastFactor" title="为避免账户被锁定，唯一登录凭证不可删除。" type="info" :closable="false" show-icon />
    </div>
  </el-card>
</template>

<style scoped>
.security-card { min-width: 0; }
.card-header, .credential-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
h2, p { margin: 0; }
.card-header p, .credential-row p { margin-top: 5px; color: var(--el-text-color-secondary); font-size: 13px; overflow-wrap: anywhere; }
.register { margin-bottom: 16px; }
.credential-list { display: grid; gap: 12px; }
.credential-row { padding: 14px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; }
@media (max-width: 640px) { .card-header, .credential-row { align-items: stretch; flex-direction: column; } }
</style>
