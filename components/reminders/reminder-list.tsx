"use client";

import { useState } from "react";

import { ReminderRow } from "@/components/reminders/reminder-row";
import { groupReminderItems } from "@/lib/reminder-groups";
import type { ReminderViewItem } from "@/lib/reminder-view";
import { cn } from "@/lib/utils";

export function ReminderList({ reminders }: { reminders: ReminderViewItem[] }) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());

  if (reminders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500 sm:p-8">
        当前筛选条件下没有提醒事项。
      </div>
    );
  }

  function toggleGroup(groupName: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      {groupReminderItems(reminders).map((group) => {
        const collapsed = collapsedGroups.has(group.name);
        const headingId = `reminder-group-${group.name}`;
        const contentId = `${headingId}-items`;

        return (
          <section key={group.name} className="space-y-3" aria-labelledby={headingId}>
            <h2 id={headingId}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-3 rounded-md text-left text-sm font-semibold text-slate-800 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
                aria-expanded={!collapsed}
                aria-controls={contentId}
                onClick={() => toggleGroup(group.name)}
              >
                <svg
                  className={cn("size-4 shrink-0 text-slate-400 transition-transform", collapsed ? "-rotate-90" : "rotate-0")}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <span className="text-balance">{group.name}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{group.items.length}</span>
                <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
              </button>
            </h2>
            <div id={contentId} className="space-y-3" hidden={collapsed}>
              {group.items.map((reminder) => (
                <ReminderRow
                  key={reminder.id}
                  id={reminder.id}
                  title={reminder.title}
                  hasActivationCode={reminder.hasActivationCode}
                  activationContact={reminder.activationContact}
                  dueAt={reminder.dueAt}
                  priority={reminder.priority}
                  category={reminder.category}
                  riskLevel={reminder.riskLevel}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
