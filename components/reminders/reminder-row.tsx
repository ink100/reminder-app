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

const riskBadgeClasses: Record<ReminderRiskLevel, string> = {
  normal: "bg-slate-100 text-slate-600",
  warning: "bg-amber-50 text-amber-600 border border-amber-200",
  urgent: "bg-orange-50 text-orange-600 border border-orange-200",
  overdue: "bg-red-50 text-red-600 border border-red-200",
  completed: "bg-emerald-50 text-emerald-600 border border-emerald-200",
};

const priorityLabels: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

function getRemainingValidDays(dueAtDate: Date) {
  const diffMs = dueAtDate.getTime() - Date.now();
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export function ReminderRow({ id, title, activationCode, activationContact, dueAt, priority, category, riskLevel }: ReminderRowProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dueAtDate = new Date(dueAt);
  const remainingValidDays = getRemainingValidDays(dueAtDate);

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

  async function handleDelete() {
    if (!confirm("确定要删除这条提醒吗？")) return;
    setDeleting(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/reminders/${id}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "删除失败");
      }

      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="group rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start gap-4">
        {/* Main content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                isActivationReminder(activationCode) ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500",
              )}
            >
              {getReminderKindLabel(activationCode)}
            </span>
            {/* Status badge — capsule style */}
            <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium", riskBadgeClasses[riskLevel])}>
              {reminderRiskLabels[riskLevel]}
            </span>
          </div>
          {activationCode ? <p className="mt-1 text-xs text-sky-600">激活码：{activationCode}</p> : null}
          {activationContact ? <p className="mt-1 text-xs text-sky-600">联系方式：{activationContact}</p> : null}
          <p className="mt-1 text-xs text-slate-400">
            {category ?? "未分类"} · {priorityLabels[priority] ?? priority}
          </p>
          {message ? <p className="mt-1 text-xs text-rose-500">{message}</p> : null}
        </div>

        {/* Time — right aligned, merged format */}
        <div className="shrink-0 text-right">
          <p className="text-xs text-slate-400">
            {dueAtDate.toLocaleString("zh-CN", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-300">{formatRemainingTime(dueAtDate)}</p>
        </div>

        {/* Actions — always visible on mobile, hover-reveal on desktop */}
        <div className="flex shrink-0 items-center gap-1 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
          {activationCode ? (
            <Link
              className="rounded-md p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600"
              href={`/license-key?clientKey=${encodeURIComponent(activationCode)}&reminderId=${encodeURIComponent(id)}&validDays=${remainingValidDays}`}
              aria-label="生成密匙"
            >
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </Link>
          ) : null}
          <Link
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            href={`/reminders/${id}/edit`}
            aria-label="编辑"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </Link>
          <button
            className="rounded-md p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-30"
            type="button"
            onClick={handleComplete}
            disabled={submitting || riskLevel === "completed"}
            aria-label="完成"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </button>
          <button
            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30"
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label="删除"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
