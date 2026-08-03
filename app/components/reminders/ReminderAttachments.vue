<script setup lang="ts">
type Attachment = { id: string; originalName: string; mimetype: string; size: number; url: string; reminderId?: string | null };
const props = defineProps<{ reminderId?: string; initial?: Attachment[] }>();
const { apiFetch } = useApi();
const files = ref([...(props.initial || [])]);
const uploading = ref(false);

async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length) return;
  uploading.value = true;
  try {
    for (const file of Array.from(input.files)) {
      const body = new FormData(); body.append("file", file); if (props.reminderId) body.append("reminderId", props.reminderId);
      const result = await apiFetch<{ item: Attachment }>("/api/upload", { method: "POST", body });
      files.value.unshift(result.item);
    }
    ElMessage.success("上传成功");
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "上传失败"); }
  finally { uploading.value = false; input.value = ""; }
}
async function remove(file: Attachment) {
  try {
    await ElMessageBox.confirm(`确定删除附件「${file.originalName}」？`, "删除附件", { type: "warning" });
    await apiFetch(`/api/attachments/${file.id}`, { method: "DELETE" });
    files.value = files.value.filter(item => item.id !== file.id);
  } catch (error) { if (error !== "cancel" && error !== "close") ElMessage.error(error instanceof Error ? error.message : "删除失败"); }
}
const size = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
</script>
<template>
  <div class="attachments">
    <label class="picker"><input type="file" multiple :disabled="uploading" @change="upload"><span>{{ uploading ? "上传中…" : "📎 点击选择附件（最大 100MB）" }}</span></label>
    <div v-for="file in files" :key="file.id" class="file"><a :href="file.url" target="_blank" rel="noopener">{{ file.originalName }}</a><small>{{ size(file.size) }}</small><ElButton text type="danger" @click="remove(file)">删除</ElButton></div>
  </div>
</template>
<style scoped>.attachments{display:grid;gap:8px}.picker{display:grid;min-height:70px;place-items:center;border:2px dashed #cbd5e1;border-radius:10px;color:#64748b;cursor:pointer}.picker input{display:none}.file{display:flex;align-items:center;gap:10px;padding:8px;border:1px solid #e2e8f0;border-radius:8px}.file a{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;color:#2563eb}.file small{color:#94a3b8}</style>
