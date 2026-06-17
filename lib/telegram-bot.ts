import { decryptText } from "@/lib/crypto";

export type TelegramBotConfigSource = {
  telegramBotEnabled: boolean;
  telegramBotTokenEncrypted: string | null;
  telegramBotChatId: string | null;
  telegramBotName: string | null;
  telegramBotUsername: string | null;
  telegramBotLastTestAt: Date | null;
  telegramBotLastTestStatus: string | null;
};

export type EditableTelegramBotSettings = {
  enabled: boolean;
  chatId: string;
  tokenConfigured: boolean;
  botName: string;
  botUsername: string;
  lastTestAt: string | null;
  lastTestStatus: string | null;
};

export type TelegramBotIdentity = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

export function getEditableTelegramBotSettings(source: TelegramBotConfigSource): EditableTelegramBotSettings {
  return {
    enabled: source.telegramBotEnabled,
    chatId: source.telegramBotChatId ?? "",
    tokenConfigured: Boolean(source.telegramBotTokenEncrypted),
    botName: source.telegramBotName ?? "",
    botUsername: source.telegramBotUsername ?? "",
    lastTestAt: source.telegramBotLastTestAt?.toISOString() ?? null,
    lastTestStatus: source.telegramBotLastTestStatus ?? null,
  };
}

export function resolveTelegramBotToken(source: Pick<TelegramBotConfigSource, "telegramBotTokenEncrypted">) {
  if (!source.telegramBotTokenEncrypted) {
    return null;
  }

  return decryptText(source.telegramBotTokenEncrypted);
}

async function requestTelegram<T>(token: string, method: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await response.json()) as { ok?: boolean; result?: T; description?: string };

  if (!response.ok || !data.ok) {
    throw new Error(data.description ?? `Telegram API 请求失败：${method}`);
  }

  return data.result as T;
}

export async function getTelegramBotIdentity(token: string) {
  return requestTelegram<TelegramBotIdentity>(token, "getMe");
}

export async function sendTelegramMessage(options: { token: string; chatId: string; text: string }) {
  return requestTelegram<{ message_id: number }>(options.token, "sendMessage", {
    chat_id: options.chatId,
    text: options.text,
    disable_web_page_preview: true,
  });
}
