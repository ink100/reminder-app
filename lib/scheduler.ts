/* eslint-disable @typescript-eslint/no-explicit-any */
import { appSettingStore } from "@/lib/app-settings/store";
import { supabaseModels } from "@/lib/reminders/store";
import { startTaskRun, finishTaskRun } from "@/lib/task-runner";

// ── 类型 ───────────────────────────────
type TaskFn = () => Promise<void>;

type RegisteredTask = {
  name: string;
  label: string;
  fn: TaskFn;
  intervalKey: keyof IntervalSettingKey;
  enabledKey: keyof EnabledSettingKey;
  fixedIntervalSeconds?: number;
  alwaysEnabled?: boolean;
};

type IntervalSettingKey = {
  reminderEmailInterval: number;
};

type EnabledSettingKey = {
  reminderEmailEnabled: boolean;
};

// ── 看门狗 ───────────────────────────────
// 定时任务最长默认 30 分钟执行一次，看门狗超时时间必须大于最长任务间隔，
// 否则应用空闲但健康时会被误判为卡死并被 systemd 反复重启。
const WATCHDOG_TIMEOUT_MS = 35 * 60 * 1000;
let lastHeartbeat = Date.now();

function heartbeat() {
  lastHeartbeat = Date.now();
}

async function watchdogLoop() {
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 30_000)); // 每 30 秒检查一次
    const elapsed = Date.now() - lastHeartbeat;
    if (elapsed > WATCHDOG_TIMEOUT_MS) {
      console.error(`[watchdog] 超时 ${Math.round(elapsed / 1000)} 秒无心跳，进程将退出`);
      process.exit(1);
    }
  }
}

// ── 注册的任务 ───────────────────────────────
async function reminderEmailDispatch() {
  const { canSendMail, createMailTransport, getMailFrom } = await import("@/lib/mailer");
  const { collectReminderNotifications } = await import("@/lib/reminder-notifications");
  const { resolveTelegramBotToken, sendTelegramMessage } = await import("@/lib/telegram-bot");

  const settings = await appSettingStore.findUnique({ where: { id: 1 } });

  if (!settings) {
    console.log("[task] skip reminder notifications: settings missing");
    return;
  }

  const emailReady = Boolean(settings.emailNotificationsEnabled && settings.notificationEmail && canSendMail(settings));
  const telegramToken = settings.telegramBotEnabled ? resolveTelegramBotToken(settings) : null;
  const telegramReady = Boolean(settings.telegramBotEnabled && settings.telegramBotChatId && telegramToken);

  if (!emailReady && !telegramReady) {
    console.log("[task] skip reminder notifications: no enabled channel");
    return;
  }

  const reminders = await supabaseModels.reminder.findMany({
    where: { deletedAt: null, completedAt: null },
    orderBy: { dueAt: "asc" },
  });

  const notifications = collectReminderNotifications(reminders, new Date());

  if (notifications.length === 0) {
    console.log("[task] no reminders to send");
    return;
  }

  const transport = emailReady ? createMailTransport(settings) : null;
  let sent = 0;
  const failures: string[] = [];

  for (const notification of notifications) {
    const reminder = reminders.find((item: any) => item.id === notification.id);
    if (!reminder) continue;

    const subjectPrefix = notification.kind === "upcoming" ? "即将到期提醒" : "已超期提醒";
    const intro =
      notification.kind === "upcoming"
        ? "这条提醒已经进入提醒窗口，请尽快处理。"
        : "这条提醒已经超期，请尽快处理。";
    const messageLines = [
      `${settings.appName} - ${subjectPrefix}`,
      "",
      intro,
      `标题：${reminder.title}`,
      reminder.activationCode ? `激活码：${reminder.activationCode}` : null,
      reminder.activationContact ? `联系方式：${reminder.activationContact}` : null,
      `分类：${reminder.category ?? "未分类"}`,
      `截止时间：${reminder.dueAt.toLocaleString("zh-CN", { hour12: false })}`,
      reminder.description ? `说明：${reminder.description}` : null,
    ].filter(Boolean) as string[];

    let delivered = false;

    if (transport && settings.notificationEmail) {
      try {
        await transport.sendMail({
          from: getMailFrom(settings),
          to: settings.notificationEmail,
          subject: `${subjectPrefix}｜${reminder.title}`,
          text: messageLines.join("\n"),
        });
        delivered = true;
      } catch (error) {
        failures.push(`邮件 ${reminder.title}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (telegramReady && telegramToken && settings.telegramBotChatId) {
      try {
        await sendTelegramMessage({
          token: telegramToken,
          chatId: settings.telegramBotChatId,
          text: messageLines.join("\n"),
        });
        delivered = true;
      } catch (error) {
        failures.push(`Telegram ${reminder.title}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (!delivered) {
      continue;
    }

    await supabaseModels.reminder.update({
      where: { id: reminder.id },
      data:
        notification.kind === "upcoming"
          ? { upcomingNotifiedAt: new Date() }
          : { overdueNotifiedAt: new Date() },
    });

    sent += 1;
  }

  const failureSummary = failures.length > 0 ? `，失败 ${failures.length} 条：${failures.slice(0, 3).join("；")}` : "";
  console.log(`[task] sent ${sent} reminder notifications${failureSummary}`);

  if (sent === 0 && failures.length > 0) {
    throw new Error(failures.slice(0, 3).join("；"));
  }
}

// ── Bot 命令注册 ───────────────────────────────
async function ensureBotCommandsRegistered() {
  const { registerBotCommand } = await import("@/lib/telegram-bot");
  const { redeemBindCode, getActiveBindings, unbindChatId } = await import("@/lib/telegram-binding");

  const HELP_TEXT = `🤖 可用命令：

/start - 查看帮助
/bind <绑定码> - 绑定 Telegram 到账户
/status - 查看绑定状态
/unbind - 解绑当前账户`;

  registerBotCommand("start", async ({ firstName }: { firstName?: string }) => {
    return `👋 你好${firstName ? `，${firstName}` : ""}！

${HELP_TEXT}`;
  });

  registerBotCommand("help", async () => HELP_TEXT);

  registerBotCommand("bind", async ({ chatId, username, firstName, text: code }: { chatId: number; username?: string; firstName?: string; text: string }) => {
    if (!code) {
      return "请输入绑定码，例如：/bind ABC123\n\n绑定码请在 Web 管理页面生成。";
    }
    const result = await redeemBindCode(code.toUpperCase(), String(chatId), { username, firstName });
    if (!result.success) return `❌ 绑定失败：${result.reason}`;
    return `✅ 绑定成功！Chat ID: ${result.chatId}\n\n现在可以接收通知了。`;
  });

  registerBotCommand("status", async ({ chatId }: { chatId: number }) => {
    const bindings = await getActiveBindings();
    const bound = bindings.find((b) => b.chatId === String(chatId));
    if (!bound) return "❌ 未绑定。\n\n在 Web 页面生成绑定码，发送 /bind <绑定码> 进行绑定。";
    return `✅ 已绑定\n绑定时间：${bound.boundAt.toLocaleString("zh-CN")}\nChat ID: ${bound.chatId}${bound.username ? `\n用户名：@${bound.username}` : ""}`;
  });

  registerBotCommand("unbind", async ({ chatId }: { chatId: number }) => {
    await unbindChatId(String(chatId));
    return "✅ 已解绑。如需重新绑定请在 Web 页面生成新的绑定码。";
  });
}

let commandsRegistered = false;

// ── Bot 轮询任务 ───────────────────────────────
async function botPollDispatch() {
  const { resolveTelegramBotToken, pollTelegramBot } = await import("@/lib/telegram-bot");

  if (!commandsRegistered) {
    await ensureBotCommandsRegistered();
    commandsRegistered = true;
  }

  const settings = await appSettingStore.findUnique({ where: { id: 1 } });
  if (!settings?.telegramBotEnabled) return;

  const token = resolveTelegramBotToken(settings);
  if (!token) return;

  try {
    const count = await pollTelegramBot(token);
    if (count > 0) {
      console.log(`[task] bot-poll 处理了 ${count} 条消息`);
    }
  } catch (error) {
    // 超时或网络错误是正常的，安静忽略
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("timeout") && !message.includes("ETIMEDOUT") && !message.includes("ENETUNREACH")) {
      console.error("[task] bot-poll 错误:", message);
    }
  }
}

// ── 注册的任务 ───────────────────────────────
async function notificationCenterDispatch() {
  const { dispatchQueueJobs, cleanupNotificationData } = await import("@/lib/notification-center/dispatcher");
  const result = await dispatchQueueJobs(20);

  if (result.processed > 0 || result.failed > 0) {
    console.log(`[task] notification-center processed=${result.processed}, failed=${result.failed}`);
  }

  const minute = new Date().getMinutes();
  if (minute === 0) {
    const cleanup = await cleanupNotificationData();
    const total = cleanup.events + cleanup.queue_jobs + cleanup.send_logs;
    if (total > 0) {
      console.log(`[task] notification-center retention cleanup`, cleanup);
    }
  }
}

async function authArtifactCleanupDispatch() {
  const { cleanupAuthArtifacts } = await import("@/lib/webauthn-ceremonies");
  const result = await cleanupAuthArtifacts();
  if (result.challenges > 0 || result.throttles > 0 || result.pendingTotpEnrollments > 0) {
    // Counts only: never emit challenge tokens, IP addresses, or usernames.
    console.log(`[task] auth artifact cleanup challenges=${result.challenges}, throttles=${result.throttles}, pendingTotpEnrollments=${result.pendingTotpEnrollments}`);
  }
}

const REGISTERED_TASKS: RegisteredTask[] = [
  { name: "reminder-email", label: "到期提醒通知", fn: reminderEmailDispatch, intervalKey: "reminderEmailInterval", enabledKey: "reminderEmailEnabled" },
  { name: "bot-poll", label: "Bot 消息轮询", fn: botPollDispatch, intervalKey: "reminderEmailInterval", enabledKey: "reminderEmailEnabled" },
  { name: "notification-center", label: "通知中心派发", fn: notificationCenterDispatch, intervalKey: "reminderEmailInterval", enabledKey: "reminderEmailEnabled" },
  { name: "auth-artifact-cleanup", label: "认证临时数据清理", fn: authArtifactCleanupDispatch, intervalKey: "reminderEmailInterval", enabledKey: "reminderEmailEnabled", fixedIntervalSeconds: 6 * 60 * 60, alwaysEnabled: true },
];

const timers: Map<string, ReturnType<typeof setInterval>> = new Map();
let watchdogStarted = false;

async function runTask(task: RegisteredTask) {
  const runId = await startTaskRun(task.name);
  const startMs = Date.now();

  try {
    await task.fn();
    const elapsed = Date.now() - startMs;
    await finishTaskRun(runId, true, `${task.label} 成功 (${elapsed}ms)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[task] ${task.name} failed:`, error);
    await finishTaskRun(runId, false, `${task.label} 失败: ${message}`);
  } finally {
    heartbeat();
  }
}

/** 根据数据库配置重置所有定时器 */
export async function refreshAllTimers() {
  for (const timer of timers.values()) {
    clearInterval(timer);
  }
  timers.clear();

  const settings = await appSettingStore.findUnique({ where: { id: 1 } });
  if (!settings) return;

  if (!watchdogStarted) {
    watchdogStarted = true;
    watchdogLoop();
  }

  for (const task of REGISTERED_TASKS) {
    const notificationCenterEnabled = task.name === "notification-center";
    const enabled = task.alwaysEnabled || (task.name === "bot-poll" ? settings.telegramBotEnabled : task.name === "notification-center" ? notificationCenterEnabled : settings[task.enabledKey] !== false);
    const sec = task.fixedIntervalSeconds ?? (task.name === "bot-poll" ? 30 : task.name === "notification-center" ? 15 : settings[task.intervalKey] ?? 60);

    if (!enabled) {
      console.log(`[scheduler] ${task.label} 已禁用，跳过`);
      continue;
    }

    const ms = sec * 1000;
    console.log(`[scheduler] ${task.label} 每 ${sec} 秒执行一次`);

    const timer = setInterval(() => {
      runTask(task).catch((err) => console.error(`[scheduler] ${task.name} 定时器异常:`, err));
    }, ms);
    timers.set(task.name, timer);

    if (task.name === "bot-poll" || task.name === "auth-artifact-cleanup") {
      runTask(task).catch((err) => console.error(`[scheduler] ${task.name} 首次执行异常:`, err));
    }
  }

  console.log(`[scheduler] 已注册 ${timers.size} 个定时任务`);
}

/** 获取当前运行状态 */
export function getSchedulerStatus() {
  return REGISTERED_TASKS.map((task) => ({
    name: task.name,
    label: task.label,
    running: timers.has(task.name),
  }));
}

export type SchedulerTaskDetail = {
  name: string;
  label: string;
  running: boolean;
};
