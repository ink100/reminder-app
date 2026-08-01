import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RemindersDashboard } from "@/components/reminders/reminders-dashboard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const activeReminder = {
  id: "active-1",
  title: "待处理证书",
  description: null,
  hasActivationCode: false,
  activationContact: null,
  dueAt: "2027-02-01T00:00:00.000Z",
  priority: "medium",
  category: "服务器与证书",
  completedAt: null,
  remindBeforeDays: 15,
};

const completedReminder = {
  ...activeReminder,
  id: "completed-1",
  title: "已完成证书",
  completedAt: "2026-07-31T08:00:00.000Z",
};

describe("RemindersDashboard completed-records view", () => {
  it("keeps completed reminders out of the current-reminders list and shows them in a separate tab", async () => {
    const user = userEvent.setup();
    render(
      <RemindersDashboard
        reminders={[activeReminder]}
        completedReminders={[completedReminder]}
        completedCount={1}
        deletedReminders={[]}
        deletedCount={0}
      />,
    );

    const activeTab = screen.getByRole("button", { name: "提醒记录（1）" });
    const completedTab = screen.getByRole("button", { name: "已完成记录（1）" });
    expect(activeTab).toHaveAttribute("aria-pressed", "true");
    expect(completedTab).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("待处理证书")).toBeVisible();
    expect(screen.queryByText("已完成证书")).not.toBeInTheDocument();

    await user.click(completedTab);

    expect(activeTab).toHaveAttribute("aria-pressed", "false");
    expect(completedTab).toHaveAttribute("aria-pressed", "true");

    expect(screen.queryByText("待处理证书")).not.toBeInTheDocument();
    expect(screen.getByText("已完成证书")).toBeVisible();
    expect(screen.getByRole("button", { name: /服务器与证书/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "恢复为未完成" })).toBeInTheDocument();
  });
});
