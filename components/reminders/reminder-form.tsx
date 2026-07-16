"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileUpload } from "@/components/ui/file-upload";
import { isActivationReminder } from "@/lib/reminder-kind";
import type { ReminderRecurrenceType } from "@/lib/reminder-recurrence";
import { REMINDER_GROUPS, getReminderGroup, type ReminderGroup } from "@/lib/reminder-groups";

type RecurrenceSelectValue = ReminderRecurrenceType | "none";

type ReminderFormValues = {
  id?: string;
  title?: string;
  description?: string;
  activationCode?: string | null;
  activationContact?: string | null;
  dueAt?: string;
  category?: string;
  priority?: "low" | "medium" | "high";
  remindBeforeDays?: number;
  remindBeforeHours?: number;
  overdueRemindEnabled?: boolean;
  recurrenceType?: ReminderRecurrenceType | null;
  recurrenceInterval?: number | null;
};

type Attachment = {
  id: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  createdAt: string;
};

type ReminderFormProps = {
  mode: "create" | "edit";
  defaultValues?: ReminderFormValues;
  attachments?: Attachment[];
};

export function ReminderForm({ mode, defaultValues, attachments }: ReminderFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(defaultValues?.title ?? "");
  const [dueAt, setDueAt] = useState(defaultValues?.dueAt ?? "");
  const [category, setCategory] = useState<ReminderGroup>(defaultValues?.category ? getReminderGroup(defaultValues.category) : "其他");
  const [description, setDescription] = useState(defaultValues?.description ?? "");
  const [reminderKind, setReminderKind] = useState<"normal" | "activation">(
    isActivationReminder(defaultValues?.activationCode) ? "activation" : "normal",
  );
  const [activationCode, setActivationCode] = useState(defaultValues?.activationCode ?? "");
  const [activationContact, setActivationContact] = useState(defaultValues?.activationContact ?? "");
  const [priority, setPriority] = useState<"low" | "medium" | "high">(defaultValues?.priority ?? "medium");
  const [remindBeforeDays, setRemindBeforeDays] = useState(String(defaultValues?.remindBeforeDays ?? 3));
  const [remindBeforeHours, setRemindBeforeHours] = useState(String(defaultValues?.remindBeforeHours ?? 0));
  const [overdueRemindEnabled, setOverdueRemindEnabled] = useState(defaultValues?.overdueRemindEnabled ?? true);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceSelectValue>(
    defaultValues?.recurrenceType ?? "none",
  );
  const [recurrenceInterval, setRecurrenceInterval] = useState(String(defaultValues?.recurrenceInterval ?? 1));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!dueAt) {
      setMessage("请先选择截止时间");
      return;
    }

    if (recurrenceType !== "none" && Number(recurrenceInterval) < 1) {
      setMessage("周期数值必须大于等于 1");
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const endpoint = mode === "create" ? "/api/reminders" : `/api/reminders/${defaultValues?.id ?? ""}`;
      const method = mode === "create" ? "POST" : "PUT";
      const response = await fetch(endpoint, {
        method,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title,
          description: description.trim() ? description.trim() : null,
          activationCode: reminderKind === "activation" && activationCode.trim() ? activationCode.trim() : null,
          activationContact:
            reminderKind === "activation" && activationContact.trim() ? activationContact.trim() : null,
          dueAt: new Date(dueAt).toISOString(),
          priority,
          category: category.trim() ? category.trim() : null,
          remindBeforeDays: Number(remindBeforeDays),
          remindBeforeHours: Number(remindBeforeHours),
          overdueRemindEnabled,
          recurrenceType: recurrenceType === "none" ? null : recurrenceType,
          recurrenceInterval: recurrenceType === "none" ? null : Number(recurrenceInterval),
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "保存失败");
      }

      router.push("/reminders");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">标题</label>
        <Input name="title" placeholder="例如：合同到期前续签" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">截止时间</label>
          <Input name="dueAt" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">优先级</label>
          <select className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm md:min-h-0" value={priority} onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high") }>
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">提前提醒天数</label>
          <Input type="number" min={0} max={30} value={remindBeforeDays} onChange={(e) => setRemindBeforeDays(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">提前提醒小时</label>
          <Input type="number" min={0} max={168} value={remindBeforeHours} onChange={(e) => setRemindBeforeHours(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">周期顺延</label>
          <select
            className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm md:min-h-0"
            value={recurrenceType}
            onChange={(e) => setRecurrenceType(e.target.value as RecurrenceSelectValue)}
          >
            <option value="none">不重复</option>
            <option value="daily">按天顺延</option>
            <option value="weekly">按周顺延</option>
            <option value="monthly">按月顺延</option>
            <option value="yearly">按年顺延</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">周期数值</label>
          <Input
            type="number"
            min={1}
            max={30}
            value={recurrenceInterval}
            onChange={(e) => setRecurrenceInterval(e.target.value)}
            disabled={recurrenceType === "none"}
          />
          <p className="text-xs text-slate-500">完成后，按这里设置的天/周/月/年顺延生成下一期。</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">提醒分组</label>
        <select
          className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm md:min-h-0"
          value={category}
          onChange={(e) => setCategory(e.target.value as ReminderGroup)}
        >
          {REMINDER_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
        </select>
        <p className="text-xs text-slate-500">用于提醒列表分区和筛选；旧分类会自动归入对应业务分组。</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">说明</label>
        <textarea className="min-h-28 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="补充提醒说明" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">记录类型</label>
        <select
          className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm md:min-h-0"
          value={reminderKind}
          onChange={(e) => {
            const nextKind = e.target.value as "normal" | "activation";
            setReminderKind(nextKind);
            if (nextKind === "normal") {
              setActivationCode("");
              setActivationContact("");
            }
          }}
        >
          <option value="normal">普通提醒</option>
          <option value="activation">激活码通知</option>
        </select>
      </div>

      {reminderKind === "activation" ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">激活码</label>
            <Input value={activationCode} onChange={(e) => setActivationCode(e.target.value)} placeholder="请输入激活码" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">联系方式</label>
            <Input
              value={activationContact}
              onChange={(e) => setActivationContact(e.target.value)}
              placeholder="例如：微信 / Telegram / 邮箱 / 手机号"
            />
          </div>
          <p className="text-xs text-slate-500">激活码通知会在列表和邮件提醒中单独展示激活码和联系方式。</p>
        </div>
      ) : null}

      <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700 md:min-h-0">
        <input type="checkbox" checked={overdueRemindEnabled} onChange={(e) => setOverdueRemindEnabled(e.target.checked)} />
        超期后继续提醒
      </label>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">附件</label>
        <FileUpload reminderId={defaultValues?.id} attachments={attachments} />
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="break-words text-sm text-slate-500">{message ?? ""}</p>
        <Button className="min-h-11 w-full sm:w-auto" type="submit" disabled={submitting}>{submitting ? "保存中..." : mode === "create" ? "创建提醒" : "保存修改"}</Button>
      </div>
    </form>
  );
}
