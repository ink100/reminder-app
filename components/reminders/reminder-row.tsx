"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { formatRemainingTime } from "@/lib/date";
import { getReminderKindLabel, isActivationReminder } from "@/lib/reminder-kind";
import {
  reminderRiskLabels,
} from "@/lib/reminder-view";
import { cn } from "@/lib/utils";
import type { ReminderRiskLevel } from "@/lib/risk-level";

type ReminderRowProps = {
  id: string;
  title: string;
  activationCode: string | null;
  activationContact: string | null;
  dueAt: string;
  priority: string;
  category: string | null;
  riskLevel: ReminderRiskLevel;
};

const riskClasses: Record<ReminderRiskLevel, string> = {
  normal: "bg-slate-100 text-slate-700",
  warning: "bg-amber-100 text-amber-700",
  urgent: "bg-orange-100 text-orange-700",
  overdue: "bg-rose-100 text-rose-700",
  completed: "bg-emerald-100 text-emerald-700",
};

const priorityLabels: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export function ReminderRow({ id, title, activationCode, activationContact, dueAt, priority, category, riskLevel }: ReminderRowProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dueAtDate = new Date(dueAt);

  async function handleComplete() {
    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/reminders/${id}/complete`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: "{}",
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "完成提醒失败");
      }

      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "完成提醒失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium text-slate-950">{title}</h3>
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
              isActivationReminder(activationCode) ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600",
            )}
          >
            {getReminderKindLabel(activationCode)}
          </span>
        </div>
        {activationCode ? <p className="mt-1 text-sm text-sky-700">激活码：{activationCode}</p> : null}
        {activationContact ? <p className="mt-1 text-sm text-sky-700">联系方式：{activationContact}</p> : null}
        <p className="mt-1 text-sm text-slate-500">
          {category ?? "未分类"} · {priorityLabels[priority] ?? priority} · {formatRemainingTime(dueAtDate)}
        </p>
        {message ? <p className="mt-1 text-sm text-rose-600">{message}</p> : null}
      </div>
      <div className="text-sm text-slate-600">{dueAtDate.toLocaleString("zh-CN")}</div>
      <div>
        <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", riskClasses[riskLevel])}>
          {reminderRiskLabels[riskLevel]}
        </span>
      </div>
      <div className="flex gap-2">
        <Link className="rounded-md border border-slate-200 px-3 py-2 text-sm" href={`/reminders/${id}/edit`}>
          编辑
        </Link>
        <button
          className="rounded-md border border-slate-200 px-3 py-2 text-sm disabled:opacity-50"
          type="button"
          onClick={handleComplete}
          disabled={submitting || riskLevel === "completed"}
        >
          {submitting ? "处理中..." : "完成"}
        </button>
      </div>
    </div>
  );
}
