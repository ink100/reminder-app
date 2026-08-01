import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReminderList } from "@/components/reminders/reminder-list";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const reminders = [
  {
    id: "activation-reminder",
    title: "店铺激活码到期",
    description: null,
    hasActivationCode: true,
    activationContact: "微信",
    dueAt: "2027-01-01T00:00:00.000Z",
    priority: "medium",
    category: "授权与店铺",
    completedAt: null,
    remindBeforeDays: 3,
    riskLevel: "normal" as const,
  },
  {
    id: "ssl-reminder",
    title: "SSL 证书到期",
    description: null,
    hasActivationCode: false,
    activationContact: null,
    dueAt: "2027-02-01T00:00:00.000Z",
    priority: "medium",
    category: "服务器与证书",
    completedAt: null,
    remindBeforeDays: 15,
    riskLevel: "normal" as const,
  },
];

describe("ReminderList", () => {
  it("does not expose activation-code payloads in the reminder list", () => {
    render(<ReminderList reminders={reminders} />);

    expect(screen.getByText("激活码通知")).toBeInTheDocument();
    for (const link of screen.getAllByRole("link")) {
      expect(link).not.toHaveAttribute("href", expect.stringContaining("clientKey="));
    }
  });

  it("collapses and expands each reminder category independently", async () => {
    const user = userEvent.setup();
    render(<ReminderList reminders={reminders} />);

    const storesToggle = screen.getByRole("button", { name: /授权与店铺/ });
    const sslToggle = screen.getByRole("button", { name: /服务器与证书/ });
    expect(storesToggle).toHaveAttribute("aria-expanded", "true");
    expect(sslToggle).toHaveAttribute("aria-expanded", "true");

    await user.click(storesToggle);
    expect(storesToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("店铺激活码到期")).not.toBeVisible();
    expect(screen.getByText("SSL 证书到期")).toBeVisible();

    await user.click(storesToggle);
    expect(storesToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("店铺激活码到期")).toBeInTheDocument();
  });
});
