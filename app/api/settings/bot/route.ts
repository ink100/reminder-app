import type { NextRequest } from "next/server";

import { requireApiSession } from "@/lib/auth";
import { toApiErrorResponse } from "@/lib/api-error";
import { ensureAppSettings } from "@/lib/bootstrap-settings";
import { encryptText } from "@/lib/crypto";
import { appSettingStore } from "@/lib/app-settings/store";
import {
  getEditableTelegramBotSettings,
  getTelegramBotIdentity,
  resolveTelegramBotToken,
  sendTelegramMessage,
} from "@/lib/telegram-bot";
import { telegramBotSettingsSchema, telegramBotTestSchema } from "@/lib/validators/bot";

export async function GET() {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await ensureAppSettings();

  return Response.json({ item: getEditableTelegramBotSettings(settings) });
}

export async function PUT(request: NextRequest) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const input = telegramBotSettingsSchema.parse(await request.json());
    const token = input.token.trim();
    const chatId = input.chatId.trim() || null;
    const tokenUpdate = input.clearToken
      ? { telegramBotTokenEncrypted: null, telegramBotName: null, telegramBotUsername: null }
      : token
        ? { telegramBotTokenEncrypted: encryptText(token) }
        : {};

    let botInfoUpdate: {
      telegramBotName?: string | null;
      telegramBotUsername?: string | null;
      telegramBotLastTestAt?: Date | null;
      telegramBotLastTestStatus?: string | null;
    } = {};
    if (token) {
      try {
        const identity = await getTelegramBotIdentity(token);
        botInfoUpdate = {
          telegramBotName: identity.first_name,
          telegramBotUsername: identity.username ?? null,
          telegramBotLastTestAt: new Date(),
          telegramBotLastTestStatus: "token_verified",
        };
      } catch (error) {
        botInfoUpdate = {
          telegramBotLastTestAt: new Date(),
          telegramBotLastTestStatus: error instanceof Error ? error.message : "Token 已保存，但校验失败",
        };
      }
    }

    const settings = await appSettingStore.update({
      where: { id: 1 },
      data: {
        telegramBotEnabled: input.enabled,
        telegramBotChatId: chatId,
        ...tokenUpdate,
        ...botInfoUpdate,
      },
    });

    return Response.json({ item: getEditableTelegramBotSettings(settings) });
  } catch (error) {
    return toApiErrorResponse(error, { defaultMessage: "Bot 配置保存失败" });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireApiSession();

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const input = telegramBotTestSchema.parse(await request.json().catch(() => ({})));
    const settings = await ensureAppSettings();
    const token = resolveTelegramBotToken(settings);

    if (!token) {
      return Response.json({ error: "请先保存 Bot Token" }, { status: 400 });
    }

    if (!settings.telegramBotChatId) {
      return Response.json({ error: "请先填写 Chat ID" }, { status: 400 });
    }

    const text = input.message || `✅ ${settings.appName} Telegram Bot 测试通知发送成功。`;
    await sendTelegramMessage({ token, chatId: settings.telegramBotChatId, text });

    const updated = await appSettingStore.update({
      where: { id: 1 },
      data: {
        telegramBotLastTestAt: new Date(),
        telegramBotLastTestStatus: "success",
      },
    });

    return Response.json({ success: true, item: getEditableTelegramBotSettings(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "测试通知发送失败";
    const updated = await appSettingStore.update({
      where: { id: 1 },
      data: {
        telegramBotLastTestAt: new Date(),
        telegramBotLastTestStatus: message,
      },
    }).catch(() => null);

    return Response.json(
      {
        error: message,
        item: updated ? getEditableTelegramBotSettings(updated) : undefined,
      },
      { status: 400 },
    );
  }
}
