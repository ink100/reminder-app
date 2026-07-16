"use client";

import Link from "next/link";

import type { ReminderPriorityFilter, ReminderStatusFilter } from "@/lib/reminder-view";
import { REMINDER_GROUPS, type ReminderGroupFilter } from "@/lib/reminder-groups";

type ReminderFiltersProps = {
  search: string;
  status: ReminderStatusFilter;
  priority: ReminderPriorityFilter;
  group: ReminderGroupFilter;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: ReminderStatusFilter) => void;
  onPriorityChange: (value: ReminderPriorityFilter) => void;
  onGroupChange: (value: ReminderGroupFilter) => void;
};

export function ReminderFilters({
  search,
  status,
  priority,
  group,
  onSearchChange,
  onStatusChange,
  onPriorityChange,
  onGroupChange,
}: ReminderFiltersProps) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(12rem,1fr)_auto_auto_auto_auto] sm:items-center">
      <input
        className="col-span-2 min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 sm:col-span-1"
        placeholder="搜索标题或标签..."
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <select
        className="min-h-11 min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 sm:px-3"
        value={status}
        onChange={(event) => onStatusChange(event.target.value as ReminderStatusFilter)}
      >
        <option value="all">全部状态</option>
        <option value="warning">即将到期</option>
        <option value="urgent">24 小时内</option>
        <option value="overdue">已超期</option>
        <option value="completed">已完成</option>
      </select>
      <select
        className="min-h-11 min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 sm:px-3"
        value={priority}
        onChange={(event) => onPriorityChange(event.target.value as ReminderPriorityFilter)}
      >
        <option value="all">全部优先级</option>
        <option value="high">高</option>
        <option value="medium">中</option>
        <option value="low">低</option>
      </select>
      <select
        className="min-h-11 min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 sm:px-3"
        value={group}
        onChange={(event) => onGroupChange(event.target.value as ReminderGroupFilter)}
      >
        <option value="all">全部分组</option>
        {REMINDER_GROUPS.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <Link
        className="col-span-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 sm:col-span-1 sm:ml-auto"
        href="/reminders/new"
      >
        <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        新增提醒
      </Link>
    </section>
  );
}
