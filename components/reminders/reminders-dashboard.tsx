"use client";

import { useMemo, useState } from "react";

import { ReminderFilters } from "@/components/reminders/reminder-filters";
import { ReminderList } from "@/components/reminders/reminder-list";
import { ReminderStats } from "@/components/reminders/reminder-stats";
import { DeletedReminderList, type DeletedReminderListItem } from "@/components/reminders/deleted-reminder-list";
import {
  buildReminderStats,
  filterReminders,
  type ReminderListItem,
  type ReminderPriorityFilter,
  type ReminderStatKey,
  type ReminderStatusFilter,
} from "@/lib/reminder-view";
import type { ReminderGroupFilter } from "@/lib/reminder-groups";

type RemindersDashboardProps = {
  reminders: ReminderListItem[];
  deletedReminders: DeletedReminderListItem[];
  deletedCount: number;
};

export function RemindersDashboard({ reminders, deletedReminders, deletedCount }: RemindersDashboardProps) {
  const [view, setView] = useState<"active" | "deleted">("active");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ReminderStatusFilter>("all");
  const [priority, setPriority] = useState<ReminderPriorityFilter>("all");
  const [group, setGroup] = useState<ReminderGroupFilter>("all");

  const stats = useMemo(() => buildReminderStats(reminders), [reminders]);
  const filteredReminders = useMemo(
    () => filterReminders(reminders, { search, status, priority, group }),
    [group, priority, reminders, search, status],
  );

  function handleStatSelect(key: ReminderStatKey) {
    setStatus(key === "total" ? "all" : key);
  }

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">提醒中心</p>
          <h1 className="text-xl font-semibold text-slate-950 sm:text-2xl">别超期 · 首页概览</h1>
        </div>
        <div className="inline-flex w-fit rounded-lg bg-slate-100 p-1" aria-label="提醒记录视图">
          <button
            className={view === "active" ? "rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm" : "rounded-md px-3 py-2 text-sm text-slate-500"}
            type="button"
            onClick={() => setView("active")}
          >
            当前提醒
          </button>
          <button
            className={view === "deleted" ? "rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm" : "rounded-md px-3 py-2 text-sm text-slate-500"}
            type="button"
            onClick={() => setView("deleted")}
          >
            已删除记录（{deletedCount}）
          </button>
        </div>
      </div>
      {view === "active" ? (
        <>
          <ReminderStats activeKey={status === "all" ? "total" : status} onSelect={handleStatSelect} {...stats} />
          <ReminderFilters
            group={group}
            priority={priority}
            search={search}
            status={status}
            onGroupChange={setGroup}
            onPriorityChange={setPriority}
            onSearchChange={setSearch}
            onStatusChange={setStatus}
          />
          <ReminderList reminders={filteredReminders} />
        </>
      ) : (
        <DeletedReminderList reminders={deletedReminders} />
      )}
    </div>
  );
}
