<script setup lang="ts">
definePageMeta({ layout: "default", middleware: "auth" });
</script>
<template><section class="form-page"><header><p>新增提醒</p><h1>创建一条新的提醒事项</h1></header><ReminderForm mode="create" /></section></template>
<style scoped>.form-page{display:grid;gap:20px;max-width:920px;margin:auto}.form-page p,.form-page h1{margin:0}.form-page p{color:#64748b;font-size:14px}.form-page h1{font-size:24px}</style>
