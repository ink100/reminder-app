"use client";

import { useMemo, useState } from "react";

import { ReminderFilters } from "@/components/reminders/reminder-filters";
import { ReminderList } from "@/components/reminders/reminder-list";
import { ReminderStats } from "@/components/reminders/reminder-stats";
import {
  buildReminderStats,
  filterReminders,
  type ReminderListItem,
  type ReminderPriorityFilter,
  type ReminderStatKey,
  type ReminderStatusFilter,
} from "@/lib/reminder-view";

type RemindersDashboardProps = {
  reminders: ReminderListItem[];
};

export function RemindersDashboard({ reminders }: RemindersDashboardProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ReminderStatusFilter>("all");
  const [priority, setPriority] = useState<ReminderPriorityFilter>("all");

  const stats = useMemo(() => buildReminderStats(reminders), [reminders]);
  const filteredReminders = useMemo(
    () => filterReminders(reminders, { search, status, priority }),
    [priority, reminders, search, status],
  );

  function handleStatSelect(key: ReminderStatKey) {
    setStatus(key === "total" ? "all" : key);
  }

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <div>
        <p className="text-sm text-slate-500">提醒中心</p>
        <h1 className="text-xl font-semibold text-slate-950 sm:text-2xl">别超期 · 首页概览</h1>
      </div>
      <ReminderStats activeKey={status === "all" ? "total" : status} onSelect={handleStatSelect} {...stats} />
      <ReminderFilters
        priority={priority}
        search={search}
        status={status}
        onPriorityChange={setPriority}
        onSearchChange={setSearch}
        onStatusChange={setStatus}
      />
      <ReminderList reminders={filteredReminders} />
    </div>
  );
}
