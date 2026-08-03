<script setup lang="ts">
import { safeReturnUrl } from "@/app/composables/useApi";
import { REMINDER_GROUPS, isoToLegacyDateTimeValue, legacyDateTimeValueToIso, reminderGroup, type ReminderItem } from "./reminder";

type Attachment = { id: string; originalName: string; mimetype: string; size: number; url: string; reminderId?: string | null };
const props = defineProps<{ mode: "create" | "edit"; reminder?: ReminderItem; attachments?: Attachment[] }>();
const route = useRoute();
const { apiFetch } = useApi();
const submitting = ref(false);
const kind = ref<"normal" | "activation">(props.reminder?.activationCode ? "activation" : "normal");
const form = reactive({
  title: props.reminder?.title || "",
  description: props.reminder?.description || "",
  activationCode: props.reminder?.activationCode || "",
  activationContact: props.reminder?.activationContact || "",
  // Deliberately identical to legacy datetime-local: UTC ISO is sliced, not converted for display.
  dueAt: props.reminder?.dueAt ? isoToLegacyDateTimeValue(props.reminder.dueAt) : "",
  category: reminderGroup(props.reminder?.category),
  priority: props.reminder?.priority || "medium",
  remindBeforeDays: props.reminder?.remindBeforeDays ?? 3,
  remindBeforeHours: props.reminder?.remindBeforeHours ?? 0,
  overdueRemindEnabled: props.reminder?.overdueRemindEnabled ?? true,
  recurrenceType: props.reminder?.recurrenceType || "none",
  recurrenceInterval: props.reminder?.recurrenceInterval ?? 1,
});

watch(kind, value => { if (value === "normal") { form.activationCode = ""; form.activationContact = ""; } });
async function submit() {
  if (!form.title.trim()) return ElMessage.warning("请输入标题");
  if (!form.dueAt) return ElMessage.warning("请先选择截止时间");
  if (form.recurrenceType !== "none" && form.recurrenceInterval < 1) return ElMessage.warning("周期数值必须大于等于 1");
  if (kind.value === "activation" && form.activationContact.trim() && !form.activationCode.trim()) return ElMessage.warning("请先填写激活码，再补充联系方式");
  submitting.value = true;
  try {
    await apiFetch(props.mode === "create" ? "/api/reminders" : `/api/reminders/${props.reminder!.id}`, {
      method: props.mode === "create" ? "POST" : "PUT",
      body: {
        title: form.title.trim(), description: form.description.trim() || null,
        activationCode: kind.value === "activation" ? form.activationCode.trim() || null : null,
        activationContact: kind.value === "activation" ? form.activationContact.trim() || null : null,
        // Element Plus returns YYYY-MM-DDTHH:mm; Date() preserves legacy browser-timezone serialization.
        dueAt: legacyDateTimeValueToIso(form.dueAt), priority: form.priority, category: form.category,
        remindBeforeDays: Number(form.remindBeforeDays), remindBeforeHours: Number(form.remindBeforeHours),
        overdueRemindEnabled: form.overdueRemindEnabled,
        recurrenceType: form.recurrenceType === "none" ? null : form.recurrenceType,
        recurrenceInterval: form.recurrenceType === "none" ? null : Number(form.recurrenceInterval),
      },
    });
    ElMessage.success(props.mode === "create" ? "提醒已创建" : "提醒已保存");
    await navigateTo(safeReturnUrl(route.query.returnTo, "/reminders"));
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "保存失败"); }
  finally { submitting.value = false; }
}
</script>

<template>
  <ElForm class="reminder-form" label-position="top" @submit.prevent="submit">
    <ElFormItem label="标题" required><ElInput v-model="form.title" maxlength="200" show-word-limit placeholder="例如：合同到期前续签" /></ElFormItem>
    <div class="grid two">
      <ElFormItem label="截止时间" required>
        <ElDatePicker v-model="form.dueAt" type="datetime" value-format="YYYY-MM-DDTHH:mm" format="YYYY-MM-DD HH:mm" placeholder="选择截止时间" style="width:100%" />
      </ElFormItem>
      <ElFormItem label="优先级"><ElSelect v-model="form.priority"><ElOption label="高" value="high" /><ElOption label="中" value="medium" /><ElOption label="低" value="low" /></ElSelect></ElFormItem>
    </div>
    <div class="grid two">
      <ElFormItem label="提前提醒天数"><ElInputNumber v-model="form.remindBeforeDays" :min="0" :max="30" /></ElFormItem>
      <ElFormItem label="提前提醒小时"><ElInputNumber v-model="form.remindBeforeHours" :min="0" :max="168" /></ElFormItem>
    </div>
    <div class="grid two">
      <ElFormItem label="周期顺延"><ElSelect v-model="form.recurrenceType"><ElOption label="不重复" value="none" /><ElOption label="按天顺延" value="daily" /><ElOption label="按周顺延" value="weekly" /><ElOption label="按月顺延" value="monthly" /><ElOption label="按年顺延" value="yearly" /></ElSelect></ElFormItem>
      <ElFormItem label="周期数值"><ElInputNumber v-model="form.recurrenceInterval" :min="1" :max="30" :disabled="form.recurrenceType === 'none'" /><small>完成后按设置的天/周/月/年顺延生成下一期。</small></ElFormItem>
    </div>
    <ElFormItem label="提醒分组"><ElSelect v-model="form.category"><ElOption v-for="group in REMINDER_GROUPS" :key="group" :label="group" :value="group" /></ElSelect></ElFormItem>
    <ElFormItem label="说明"><ElInput v-model="form.description" type="textarea" :rows="4" placeholder="补充提醒说明" /></ElFormItem>
    <ElFormItem label="记录类型"><ElSelect v-model="kind"><ElOption label="普通提醒" value="normal" /><ElOption label="激活码通知" value="activation" /></ElSelect></ElFormItem>
    <template v-if="kind === 'activation'">
      <ElFormItem label="激活码"><ElInput v-model="form.activationCode" type="textarea" :rows="4" maxlength="10000" placeholder="请输入激活码" /></ElFormItem>
      <ElFormItem label="联系方式"><ElInput v-model="form.activationContact" maxlength="200" placeholder="例如：微信 / Telegram / 邮箱 / 手机号" /></ElFormItem>
      <p class="hint">激活码仅在编辑记录和通知内容中完整使用，提醒列表不会直接展示。</p>
    </template>
    <ElFormItem><ElCheckbox v-model="form.overdueRemindEnabled">超期后继续提醒</ElCheckbox></ElFormItem>
    <ElFormItem label="附件"><ReminderAttachments :reminder-id="reminder?.id" :initial="attachments" /></ElFormItem>
    <footer><ElButton @click="navigateTo(safeReturnUrl(route.query.returnTo, '/reminders'))">取消</ElButton><ElButton type="primary" native-type="submit" :loading="submitting">{{ mode === 'create' ? '创建提醒' : '保存修改' }}</ElButton></footer>
  </ElForm>
</template>
<style scoped>.reminder-form{padding:22px;border:1px solid #e2e8f0;border-radius:14px;background:#fff}.grid{display:grid;gap:18px}.two{grid-template-columns:1fr 1fr}.reminder-form :deep(.el-select),.reminder-form :deep(.el-input-number){width:100%}.hint,small{color:#64748b;font-size:12px}.hint{margin:-12px 0 20px}footer{display:flex;justify-content:flex-end;gap:10px;padding-top:18px;border-top:1px solid #e2e8f0}@media(max-width:600px){.two{grid-template-columns:1fr}.reminder-form{padding:14px}}</style>
