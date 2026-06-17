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
    signal: AbortSignal.timeout(10_000),
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

// ── Bot Updates（轮询） ─────────────────────────────

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; username?: string; first_name?: string };
    text?: string;
    date: number;
  };
};

export async function getTelegramUpdates(token: string, offset?: number, timeout = 30): Promise<TelegramUpdate[]> {
  const params: Record<string, unknown> = {
    timeout,
    allowed_updates: ["message"],
  };
  if (offset !== undefined) {
    params.offset = offset;
  }
  return requestTelegram<TelegramUpdate[]>(token, "getUpdates", params);
}

type CommandHandler = (ctx: { token: string; chatId: number; username?: string; firstName?: string; text: string }) => Promise<string>;

const commandHandlers: Map<string, CommandHandler> = new Map();

export function registerBotCommand(command: string, handler: CommandHandler) {
  commandHandlers.set(command.toLowerCase(), handler);
}

export async function processTelegramUpdate(
  token: string,
  update: TelegramUpdate,
): Promise<void> {
  const message = update.message;
  if (!message?.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();
  const username = message.chat.username;
  const firstName = message.chat.first_name;

  // 解析命令 /command 或 /command@botusername
  const match = text.match(/^\/(\w+)(?:@\w+)?(?:\s+(.+))?$/);
  if (!match) return;

  const commandName = match[1].toLowerCase();
  const args = (match[2] ?? "").trim();

  const handler = commandHandlers.get(commandName);
  if (!handler) {
    // 未知命令，提示 /start
    await sendTelegramMessage({
      token,
      chatId: String(chatId),
      text: `未知命令。发送 /start 查看可用命令。`,
    });
    return;
  }

  const reply = await handler({
    token,
    chatId,
    username,
    firstName,
    text: args,
  });

  if (reply) {
    await sendTelegramMessage({
      token,
      chatId: String(chatId),
      text: reply,
    });
  }
}

let lastUpdateId = 0;

/** 执行一次轮询：调用 getUpdates 并处理所有新消息 */
export async function pollTelegramBot(token: string): Promise<number> {
  const updates = await getTelegramUpdates(token, lastUpdateId + 1, 30);

  if (updates.length === 0) return 0;

  for (const update of updates) {
    try {
      await processTelegramUpdate(token, update);
    } catch (error) {
      console.error("[bot-poll] 处理消息失败:", error);
    }
    lastUpdateId = Math.max(lastUpdateId, update.update_id);
  }

  return updates.length;
}

/** 重置轮询偏移（Token 变更时调用） */
export function resetBotPollingOffset() {
  lastUpdateId = 0;
}
