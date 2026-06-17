import * as dns from "node:dns";
import * as https from "node:https";

import { decryptText } from "@/lib/crypto";

// 当前 VPS 的 IPv6 到 Telegram 不通，Node fetch 可能优先尝试 IPv6 并直接超时；
// 强制 Telegram Bot 模块内的 DNS 结果优先使用 IPv4。
dns.setDefaultResultOrder("ipv4first");

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

async function requestTelegram<T>(token: string, method: string, body?: Record<string, unknown>, timeoutMs = 10_000): Promise<T> {
  const payload = body ? JSON.stringify(body) : undefined;

  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${token}/${method}`,
        method: payload ? "POST" : "GET",
        family: 4,
        timeout: timeoutMs,
        headers: payload
          ? {
              "content-type": "application/json",
              "content-length": Buffer.byteLength(payload),
            }
          : undefined,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            const data = JSON.parse(raw) as { ok?: boolean; result?: T; description?: string };
            if ((res.statusCode ?? 500) >= 400 || !data.ok) {
              reject(new Error(data.description ?? `Telegram API 请求失败：${method}`));
              return;
            }
            resolve(data.result as T);
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error(`Telegram API 请求超时：${method}`));
    });
    req.on("error", reject);

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
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

export async function getTelegramUpdates(token: string, offset?: number, timeout = 20): Promise<TelegramUpdate[]> {
  const params: Record<string, unknown> = {
    timeout,
    allowed_updates: ["message"],
  };
  if (offset !== undefined) {
    params.offset = offset;
  }
  return requestTelegram<TelegramUpdate[]>(token, "getUpdates", params, (timeout + 10) * 1000);
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
  const updates = await getTelegramUpdates(token, lastUpdateId + 1, 20);

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
