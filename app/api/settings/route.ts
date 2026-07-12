import type { NextRequest } from "next/server";

import { requireApiSession } from "@/lib/auth";
import { toApiErrorResponse } from "@/lib/api-error";
import { ensureAppSettings } from "@/lib/bootstrap-settings";
import { encryptText } from "@/lib/crypto";
import { getEditableMailSettings } from "@/lib/mail-settings";
import { appSettingStore } from "@/lib/app-settings/store";
import { refreshAllTimers } from "@/lib/scheduler";
import { getTaskRunLogs } from "@/lib/task-runner";
import { settingsInputSchema } from "@/lib/validators/settings";

export async function GET() {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await ensureAppSettings();
  const logs = await getTaskRunLogs();

  return Response.json({
    item: {
      ...getEditableMailSettings(settings),
      reminderEmailEnabled: settings.reminderEmailEnabled,
      reminderEmailInterval: settings.reminderEmailInterval,
      notifyStartHour: settings.notifyStartHour,
      notifyEndHour: settings.notifyEndHour,
    },
    taskLogs: logs,
  });
}

export async function PUT(request: NextRequest) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const input = settingsInputSchema.parse(await request.json());
    const smtpHost = input.smtpHost.trim() || null;
    const smtpUser = input.smtpUser.trim() || null;
    const smtpFromEmail = input.smtpFromEmail.trim() || null;
    const smtpFromName = input.smtpFromName.trim() || null;
    const settings = await appSettingStore.update({
      where: { id: 1 },
      data: {
        appName: input.appName,
        timezone: input.timezone,
        emailNotificationsEnabled: input.emailNotificationsEnabled,
        notificationEmail: input.notificationEmail,
        smtpHost,
        smtpPort: smtpHost ? input.smtpPort : null,
        smtpUser,
        smtpFromEmail,
        smtpFromName,
        ...(input.clearSmtpPass
          ? { smtpPassEncrypted: null }
          : input.smtpPass.trim()
            ? { smtpPassEncrypted: encryptText(input.smtpPass.trim()) }
            : {}),
        reminderEmailEnabled: input.reminderEmailEnabled ?? true,
        reminderEmailInterval: input.reminderEmailInterval ?? 1800,
        notifyStartHour: input.notifyStartHour ?? 9,
        notifyEndHour: input.notifyEndHour ?? 22,
      },
    });

    await refreshAllTimers();

    return Response.json({
      item: {
        ...getEditableMailSettings(settings),
        reminderEmailEnabled: settings.reminderEmailEnabled,
        reminderEmailInterval: settings.reminderEmailInterval,
        notifyStartHour: settings.notifyStartHour,
        notifyEndHour: settings.notifyEndHour,
      },
    });
  } catch (error) {
    return toApiErrorResponse(error, { defaultMessage: "请求参数不合法" });
  }
}
