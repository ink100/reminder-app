<script setup lang="ts">
import type { ManagedFile } from "./ImageGallery.vue";
const emit = defineEmits<{ uploaded: [file: ManagedFile] }>(); const { apiFetch } = useApi();
const uploading = ref(false); const progress = ref(""); const uploaded = ref<ManagedFile[]>([]); const previews = ref<{ file:File; url:string }[]>([]);
function release() { for(const item of previews.value) URL.revokeObjectURL(item.url); previews.value=[]; }
onBeforeUnmount(release);
async function selected(file:File) {
  if(file.size>100*1024*1024) return ElMessage.error("文件大小超过限制 (100MB)");
  const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : ""; if(preview) previews.value.push({file,url:preview});
  uploading.value=true; progress.value=`上传中：${file.name}`;
  try { const body=new FormData(); body.append("file",file); const result=await apiFetch<{data:ManagedFile}>("/api/images",{method:"POST",body}); uploaded.value.unshift(result.data); emit("uploaded",result.data); ElMessage.success(`${file.name} 上传成功`); }
  catch(error){ ElMessage.error(error instanceof Error?error.message:"上传失败"); }
  finally { if(preview){ URL.revokeObjectURL(preview); previews.value=previews.value.filter(item=>item.url!==preview); } uploading.value=false; progress.value=""; }
}
async function copyAll(){ try{await navigator.clipboard.writeText(uploaded.value.map(i=>i.url).join("\n"));ElMessage.success("链接已复制");}catch{ElMessage.error("复制失败");} }
</script>
<template><div class="uploader"><FileUpload accept="*/*" multiple :limit-bytes="100*1024*1024" :disabled="uploading" @select="selected" @error="ElMessage.error($event)"><div class="copy"><b>{{ uploading ? progress : '拖拽文件到这里，或点击选择文件' }}</b><small>支持任意格式文件，单文件最大 100MB，可多选</small></div></FileUpload><div v-if="previews.length" class="previews"><img v-for="item in previews" :key="item.url" :src="item.url" :alt="item.file.name"></div><ElAlert v-if="uploaded.length" type="success" :closable="false"><template #title>上传成功（{{ uploaded.length }} 个文件）</template><div class="result"><span v-for="file in uploaded" :key="file.id">{{ file.originalName }} <code>{{ file.url }}</code></span><ElButton size="small" @click="copyAll">复制全部链接</ElButton><ElButton size="small" @click="uploaded=[]">关闭</ElButton></div></ElAlert></div></template>
<style scoped>.uploader,.result{display:grid;gap:12px}.copy{display:grid;gap:8px;padding:24px;color:#475569}.copy small{color:#94a3b8}.previews{display:flex;gap:8px}.previews img{height:70px;width:70px;object-fit:cover}.result span{display:grid;gap:3px}.result code{overflow:hidden;text-overflow:ellipsis}</style>
