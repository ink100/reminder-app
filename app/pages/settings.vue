<script setup lang="ts">definePageMeta({ layout: "default", middleware: ["auth", "admin"] });</script>
<template><div class="page"><header><el-text type="info">配置页面</el-text><h1>提醒规则与安全设置</h1><p>管理应用、对象存储和邮件通知。敏感值不会回显。</p></header><R2SettingsCard/><AppSettingsForm/></div></template>
<style scoped>.page{display:grid;gap:24px}h1,p{margin:4px 0}h1{font-size:28px}p{color:var(--el-text-color-secondary)}</style>
