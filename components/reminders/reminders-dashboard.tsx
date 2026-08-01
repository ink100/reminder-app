"use client";

import { useMemo, useState } from "react";

import { ReminderFilters } from "@/components/reminders/reminder-filters";
import { ReminderList } from "@/components/reminders/reminder-list";
import { ReminderStats } from "@/components/reminders/reminder-stats";
import { DeletedReminderList, type DeletedReminderListItem } from "@/components/reminders/deleted-reminder-list";
import {
  buildReminderStats,
  buildReminderViewItems,
  filterReminders,
  type ReminderListItem,
  type ReminderPriorityFilter,
  type ReminderStatKey,
  type ReminderStatusFilter,
} from "@/lib/reminder-view";
import type { ReminderGroupFilter } from "@/lib/reminder-groups";

type RemindersDashboardProps = {
  reminders: ReminderListItem[];
  completedReminders: ReminderListItem[];
  completedCount: number;
  deletedReminders: DeletedReminderListItem[];
  deletedCount: number;
};

type ReminderView = "active" | "completed" | "deleted";

function tabClass(active: boolean) {
  return active
    ? "rounded-md bg-white px-2 py-2 text-xs font-medium text-slate-900 shadow-sm sm:px-3 sm:text-sm"
    : "rounded-md px-2 py-2 text-xs text-slate-500 sm:px-3 sm:text-sm";
}

export function RemindersDashboard({ reminders, completedReminders, completedCount, deletedReminders, deletedCount }: RemindersDashboardProps) {
  const [view, setView] = useState<ReminderView>("active");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ReminderStatusFilter>("all");
  const [priority, setPriority] = useState<ReminderPriorityFilter>("all");
  const [group, setGroup] = useState<ReminderGroupFilter>("all");

  const stats = useMemo(() => buildReminderStats(reminders), [reminders]);
  const filteredReminders = useMemo(
    () => filterReminders(reminders, { search, status, priority, group }),
    [group, priority, reminders, search, status],
  );
  const completedViewItems = useMemo(() => buildReminderViewItems(completedReminders), [completedReminders]);

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
        <div className="grid w-full grid-cols-3 rounded-lg bg-slate-100 p-1 sm:w-fit" aria-label="提醒记录视图">
          <button className={tabClass(view === "active")} type="button" aria-pressed={view === "active"} onClick={() => setView("active")}>
            提醒记录（{reminders.length}）
          </button>
          <button className={tabClass(view === "completed")} type="button" aria-pressed={view === "completed"} onClick={() => setView("completed")}>
            已完成记录（{completedCount}）
          </button>
          <button className={tabClass(view === "deleted")} type="button" aria-pressed={view === "deleted"} onClick={() => setView("deleted")}>
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
      ) : view === "completed" ? (
        <ReminderList
          reminders={completedViewItems}
          variant="completed"
          emptyMessage="暂无已完成的提醒记录。"
        />
      ) : (
        <DeletedReminderList reminders={deletedReminders} />
      )}
    </div>
  );
}
