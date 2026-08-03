<script setup lang="ts">
import type { UploadFile, UploadFiles, UploadProps, UploadRequestOptions } from "element-plus";

const props = withDefaults(defineProps<{ accept?: string; multiple?: boolean; limitBytes?: number; disabled?: boolean; drag?: boolean }>(), {
  accept: "*/*", multiple: false, limitBytes: 100 * 1024 * 1024, disabled: false, drag: true,
});
const emit = defineEmits<{ select: [file: File]; error: [message: string] }>();

const request: UploadProps["httpRequest"] = (options: UploadRequestOptions) => {
  const file = options.file;
  if (file.size > props.limitBytes) {
    const message = `文件不能超过 ${Math.round(props.limitBytes / 1024 / 1024)}MB`;
    emit("error", message); options.onError(Object.assign(new Error(message), { status: 0, method: "POST", url: "" })); return Promise.reject(new Error(message));
  }
  emit("select", file); options.onSuccess({}); return Promise.resolve({});
};
function change(file: UploadFile, _files: UploadFiles) {
  if (file.raw && file.raw.size > props.limitBytes) emit("error", `文件不能超过 ${Math.round(props.limitBytes / 1024 / 1024)}MB`);
}
</script>
<template>
  <ElUpload :accept="accept" :multiple="multiple" :disabled="disabled" :drag="drag" :show-file-list="false" :http-request="request" :on-change="change">
    <slot><div class="upload-copy"><strong>点击或拖拽文件到这里</strong><small>单文件最大 {{ Math.round(limitBytes / 1024 / 1024) }}MB</small></div></slot>
  </ElUpload>
</template>
<style scoped>.upload-copy{display:grid;gap:8px;padding:20px;color:#475569}.upload-copy small{color:#94a3b8}</style>
