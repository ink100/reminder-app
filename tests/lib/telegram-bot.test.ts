import { describe, expect, it } from "vitest";

import { getEditableTelegramBotSettings } from "@/lib/telegram-bot";

describe("telegram bot settings", () => {
  it("does not expose encrypted bot token in editable settings", () => {
    const result = getEditableTelegramBotSettings({
      telegramBotEnabled: true,
      telegramBotTokenEncrypted: "encrypted-token",
      telegramBotChatId: "123456",
      telegramBotName: "ReminderBot",
      telegramBotUsername: "reminder_test_bot",
      telegramBotLastTestAt: new Date("2026-06-17T10:00:00.000Z"),
      telegramBotLastTestStatus: "success",
    });

    expect(result).toEqual({
      enabled: true,
      chatId: "123456",
      tokenConfigured: true,
      botName: "ReminderBot",
      botUsername: "reminder_test_bot",
      lastTestAt: "2026-06-17T10:00:00.000Z",
      lastTestStatus: "success",
    });
    expect(result).not.toHaveProperty("token");
  });
});
