<script setup lang="ts">
definePageMeta({ layout: "default", middleware: "auth" });
await navigateTo("/reminders", { replace: true });
</script>
<template><span /></template>
