import { describe, expect, it } from "vitest";

import { getReminderKindLabel, isActivationReminder } from "@/lib/reminder-kind";

describe("reminder kind helpers", () => {
  it("detects activation reminders from activation code", () => {
    expect(isActivationReminder("ABC-123")).toBe(true);
    expect(isActivationReminder(null)).toBe(false);
    expect(isActivationReminder("   ")).toBe(false);
  });

  it("returns chinese labels for reminder kinds", () => {
    expect(getReminderKindLabel("ABC-123")).toBe("激活码通知");
    expect(getReminderKindLabel(null)).toBe("普通提醒");
  });
});
