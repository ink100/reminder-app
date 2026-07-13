"use client";

import { cn } from "@/lib/utils";
import type { ReminderStatKey } from "@/lib/reminder-view";

type ReminderStatsProps = {
  total: number;
  warning: number;
  urgent: number;
  overdue: number;
  completed: number;
  activeKey: ReminderStatKey;
  onSelect: (key: ReminderStatKey) => void;
};

const cards = [
  {
    key: "total",
    label: "全部事项",
    accentColor: "bg-slate-400",
    valueClass: "text-slate-900",
  },
  {
    key: "warning",
    label: "即将到期",
    accentColor: "bg-amber-400",
    valueClass: "text-amber-600",
  },
  {
    key: "urgent",
    label: "24h 内",
    accentColor: "bg-orange-400",
    valueClass: "text-orange-600",
  },
  {
    key: "overdue",
    label: "已超期",
    accentColor: "bg-rose-500",
    valueClass: "text-rose-600",
  },
  {
    key: "completed",
    label: "已完成",
    accentColor: "bg-emerald-400",
    valueClass: "text-emerald-600",
  },
] as const satisfies Array<{
  key: ReminderStatKey;
  label: string;
  accentColor: string;
  valueClass: string;
}>;

export function ReminderStats(props: ReminderStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 md:gap-3">
      {cards.map((card) => {
        const isActive = props.activeKey === card.key;

        return (
          <button
            key={card.key}
            type="button"
            onClick={() => props.onSelect(card.key)}
            className={cn(
              "relative min-h-20 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:shadow-md md:p-4",
              isActive && "border-slate-400 ring-2 ring-slate-900/10",
            )}
          >
            {/* Top accent line */}
            <div className={cn("absolute inset-x-0 top-0 h-0.5", card.accentColor)} />
            <p className="text-[10px] font-medium text-slate-400 md:text-xs">{card.label}</p>
            <p className={cn("mt-1 text-xl font-bold tabular-nums md:text-3xl", card.valueClass)}>
              {props[card.key]}
            </p>
          </button>
        );
      })}
    </div>
  );
}
