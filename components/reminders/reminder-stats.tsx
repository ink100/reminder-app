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
  { key: "total", label: "全部事项", className: "border-slate-200 bg-slate-50 text-slate-900" },
  { key: "warning", label: "即将到期", className: "border-amber-200 bg-amber-50 text-amber-900" },
  { key: "urgent", label: "24h 内", className: "border-orange-200 bg-orange-50 text-orange-900" },
  { key: "overdue", label: "已超期", className: "border-rose-200 bg-rose-50 text-rose-900" },
  { key: "completed", label: "已完成", className: "border-emerald-200 bg-emerald-50 text-emerald-900" },
] as const satisfies Array<{ key: ReminderStatKey; label: string; className: string }>;

export function ReminderStats(props: ReminderStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-5">
      {cards.map((card) => {
        const isActive = props.activeKey === card.key;

        return (
          <button
            key={card.key}
            type="button"
            onClick={() => props.onSelect(card.key)}
            className={cn(
              "rounded-xl border p-4 text-left transition hover:shadow-sm",
              card.className,
              isActive && "ring-2 ring-slate-900/70",
            )}
          >
            <p className="text-sm opacity-80">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold">{props[card.key]}</p>
          </button>
        );
      })}
    </div>
  );
}
