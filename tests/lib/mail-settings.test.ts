import { describe, expect, it } from "vitest";

import { encryptText } from "@/lib/crypto";
import { getEditableMailSettings, resolveMailConfig } from "@/lib/mail-settings";

describe("mail settings", () => {
  it("resolves a complete smtp config from encrypted app settings", () => {
    const result = resolveMailConfig({
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpUser: "mailer",
      smtpPassEncrypted: encryptText("secret-pass"),
      smtpFromEmail: "bot@example.com",
      smtpFromName: "提醒助手",
    });

    expect(result).toEqual({
      host: "smtp.example.com",
      port: 587,
      user: "mailer",
      pass: "secret-pass",
      fromEmail: "bot@example.com",
      fromName: "提醒助手",
    });
  });

  it("returns null for incomplete smtp config", () => {
    expect(
      resolveMailConfig({
        smtpHost: "smtp.example.com",
        smtpPort: 587,
        smtpUser: "mailer",
        smtpPassEncrypted: null,
        smtpFromEmail: "bot@example.com",
        smtpFromName: null,
      }),
    ).toBeNull();
  });

  it("builds editable settings without exposing saved smtp password", () => {
    expect(
      getEditableMailSettings({
        appName: "到期提醒",
        timezone: "Asia/Shanghai",
        emailNotificationsEnabled: true,
        notificationEmail: "me@example.com",
        smtpHost: "smtp.example.com",
        smtpPort: 465,
        smtpUser: "mailer",
        smtpPassEncrypted: encryptText("secret-pass"),
        smtpFromEmail: "bot@example.com",
        smtpFromName: "提醒助手",
      }),
    ).toMatchObject({
      smtpHost: "smtp.example.com",
      smtpPort: 465,
      smtpUser: "mailer",
      smtpFromEmail: "bot@example.com",
      smtpFromName: "提醒助手",
      smtpPasswordConfigured: true,
    });
  });
});
