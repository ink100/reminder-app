import { describe, expect, it } from "vitest";

import { buildTestMail } from "@/lib/test-mail";

describe("buildTestMail", () => {
  it("builds a chinese test mail payload", () => {
    const result = buildTestMail({
      appName: "到期提醒",
      to: "me@example.com",
      from: "提醒助手 <bot@example.com>",
    });

    expect(result.to).toBe("me@example.com");
    expect(result.from).toBe("提醒助手 <bot@example.com>");
    expect(result.subject).toContain("测试邮件");
    expect(result.text).toContain("这是一封测试邮件");
    expect(result.text).toContain("到期提醒");
  });
});
