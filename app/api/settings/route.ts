import type { NextRequest } from "next/server";

import { requireApiSession } from "@/lib/auth";
import { toApiErrorResponse } from "@/lib/api-error";
import { ensureAppSettings } from "@/lib/bootstrap-settings";
import { encryptText } from "@/lib/crypto";
import { getEditableMailSettings } from "@/lib/mail-settings";
import { prisma } from "@/lib/prisma";
import { settingsInputSchema } from "@/lib/validators/settings";

export async function GET() {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({ item: getEditableMailSettings(await ensureAppSettings()) });
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
    const settings = await prisma.appSetting.update({
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
      },
    });

    return Response.json({ item: getEditableMailSettings(settings) });
  } catch (error) {
    return toApiErrorResponse(error, { defaultMessage: "请求参数不合法" });
  }
}
