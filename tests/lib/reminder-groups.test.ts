import { describe, expect, it } from "vitest";

import {
  REMINDER_GROUPS,
  getReminderGroup,
  groupReminderItems,
} from "@/lib/reminder-groups";

describe("reminder groups", () => {
  it("maps legacy categories into the canonical business groups", () => {
    expect(getReminderGroup("SSL证书")).toBe("服务器与证书");
    expect(getReminderGroup("宠物")).toBe("宠物健康");
    expect(getReminderGroup("生活")).toBe("日常生活");
    expect(getReminderGroup("激活码")).toBe("授权与店铺");
    expect(getReminderGroup("续费")).toBe("账单与续费");
    expect(getReminderGroup("项目")).toBe("工作与项目");
  });

  it("places blank and unknown categories in other without losing items", () => {
    expect(getReminderGroup(null)).toBe("其他");
    expect(getReminderGroup("临时事项")).toBe("其他");
  });

  it("returns non-empty groups in the configured display order", () => {
    const grouped = groupReminderItems([
      { id: "other", category: null },
      { id: "pet", category: "宠物" },
      { id: "ssl", category: "SSL证书" },
      { id: "life", category: "生活" },
    ]);

    expect(grouped.map((group) => group.name)).toEqual([
      "服务器与证书",
      "宠物健康",
      "日常生活",
      "其他",
    ]);
    expect(grouped.flatMap((group) => group.items.map((item) => item.id))).toEqual([
      "ssl",
      "pet",
      "life",
      "other",
    ]);
    expect(REMINDER_GROUPS).toContain("授权与店铺");
  });
});
