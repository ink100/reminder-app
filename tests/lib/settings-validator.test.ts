import { describe, expect, it } from "vitest";

import { settingsInputSchema } from "@/lib/validators/settings";

describe("settingsInputSchema", () => {
  it("accepts settings payload without global reminder timing fields", () => {
    const result = settingsInputSchema.parse({
      appName: "到期提醒",
      timezone: "Asia/Shanghai",
      emailNotificationsEnabled: true,
      notificationEmail: "me@example.com",
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpUser: "mailer",
      smtpPass: "secret-pass",
      smtpFromEmail: "bot@example.com",
      smtpFromName: "提醒助手",
      clearSmtpPass: false,
    });

    expect(result.appName).toBe("到期提醒");
    expect(result.smtpHost).toBe("smtp.example.com");
  });

  it("allows keeping existing smtp password by submitting an empty password", () => {
    const result = settingsInputSchema.parse({
      appName: "到期提醒",
      timezone: "Asia/Shanghai",
      emailNotificationsEnabled: false,
      notificationEmail: null,
      smtpHost: "smtp.example.com",
      smtpPort: 465,
      smtpUser: "mailer",
      smtpPass: "",
      smtpFromEmail: "bot@example.com",
      smtpFromName: "提醒助手",
      clearSmtpPass: false,
    });

    expect(result.smtpPass).toBe("");
  });

  it("accepts inventory notification hours including midnight", () => {
    const result = settingsInputSchema.parse({
      appName: "到期提醒",
      timezone: "Asia/Shanghai",
      emailNotificationsEnabled: false,
      notificationEmail: null,
      smtpHost: "smtp.example.com",
      smtpPort: 465,
      smtpUser: "mailer",
      smtpPass: "",
      smtpFromEmail: "bot@example.com",
      smtpFromName: "提醒助手",
      clearSmtpPass: false,
      notifyStartHour: 0,
      notifyEndHour: 23,
    });

    expect(result.notifyStartHour).toBe(0);
    expect(result.notifyEndHour).toBe(23);
  });

  it("rejects notification hours outside 0-23", () => {
    expect(() =>
      settingsInputSchema.parse({
        appName: "到期提醒",
        timezone: "Asia/Shanghai",
        emailNotificationsEnabled: false,
        notificationEmail: null,
        smtpHost: "smtp.example.com",
        smtpPort: 465,
        smtpUser: "mailer",
        smtpPass: "",
        smtpFromEmail: "bot@example.com",
        smtpFromName: "提醒助手",
        clearSmtpPass: false,
        notifyStartHour: -1,
      }),
    ).toThrow();

    expect(() =>
      settingsInputSchema.parse({
        appName: "到期提醒",
        timezone: "Asia/Shanghai",
        emailNotificationsEnabled: false,
        notificationEmail: null,
        smtpHost: "smtp.example.com",
        smtpPort: 465,
        smtpUser: "mailer",
        smtpPass: "",
        smtpFromEmail: "bot@example.com",
        smtpFromName: "提醒助手",
        clearSmtpPass: false,
        notifyEndHour: 24,
      }),
    ).toThrow();
  });
});
