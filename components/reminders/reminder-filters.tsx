"use client";

import Link from "next/link";

import type { ReminderPriorityFilter, ReminderStatusFilter } from "@/lib/reminder-view";

type ReminderFiltersProps = {
  search: string;
  status: ReminderStatusFilter;
  priority: ReminderPriorityFilter;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: ReminderStatusFilter) => void;
  onPriorityChange: (value: ReminderPriorityFilter) => void;
};

export function ReminderFilters({
  search,
  status,
  priority,
  onSearchChange,
  onStatusChange,
  onPriorityChange,
}: ReminderFiltersProps) {
  return (
    <section className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
      <input
        className="rounded-md border border-slate-200 px-3 py-2 text-sm"
        placeholder="搜索标题或标签"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <select
        className="rounded-md border border-slate-200 px-3 py-2 text-sm"
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
        className="rounded-md border border-slate-200 px-3 py-2 text-sm"
        value={priority}
        onChange={(event) => onPriorityChange(event.target.value as ReminderPriorityFilter)}
      >
        <option value="all">全部优先级</option>
        <option value="high">高</option>
        <option value="medium">中</option>
        <option value="low">低</option>
      </select>
      <Link className="rounded-md bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white" href="/reminders/new">
        新增提醒
      </Link>
    </section>
  );
}
