import { prisma } from "@/lib/prisma";
import { startTaskRun, finishTaskRun } from "@/lib/task-runner";

// ── 类型 ───────────────────────────────
type TaskFn = () => Promise<void>;

type RegisteredTask = {
  name: string;
  label: string;
  fn: TaskFn;
  intervalKey: keyof IntervalSettingKey;
  enabledKey: keyof EnabledSettingKey;
};

type IntervalSettingKey = {
  inventoryCheckInterval: number;
  reminderEmailInterval: number;
};

type EnabledSettingKey = {
  inventoryCheckEnabled: boolean;
  reminderEmailEnabled: boolean;
};

// ── 看门狗 ───────────────────────────────
const WATCHDOG_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟无心跳视为卡死
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
      // 强制退出，由外层 wrapper 重启
      process.exit(1);
    }
  }
}

// ── 注册的任务 ───────────────────────────────
async function inventoryCheck() {
  const { ensureAppSettings } = await import("@/lib/bootstrap-settings");
  const { canSendMail, createMailTransport, getMailFrom } = await import("@/lib/mailer");
  const { updateInventoryNotificationStates } = await import("@/lib/inventory-service");

  const settings = await ensureAppSettings();
  const notifications = await updateInventoryNotificationStates();

  if (notifications.length === 0) {
    console.log("[task] no inventory notifications");
    return;
  }

  if (!settings.emailNotificationsEnabled || !settings.notificationEmail) {
    console.log("[task] skip inventory email: disabled or no recipient");
    return;
  }

  if (!canSendMail(settings)) {
    console.log("[task] skip inventory email: smtp config missing");
    return;
  }

  const transport = createMailTransport(settings);
  await transport.sendMail({
    from: getMailFrom(settings),
    to: settings.notificationEmail,
    subject: `库存通知｜${notifications.length} 个商品命中阈值`,
    text: [
      `${settings.appName} - 库存通知`,
      "",
      "以下商品当前库存落在配置范围内：",
      ...notifications.map(
        (item) =>
          `- [${item.sourceLabel}] ${item.name}｜库存 ${item.stock}｜通知区间 ${item.minNotifyStock}-${item.maxNotifyStock}${item.productUrl ? `｜${item.productUrl}` : ""}`,
      ),
    ].join("\n"),
  });

  console.log(`[task] sent ${notifications.length} inventory notifications`);
}

async function reminderEmailDispatch() {
  const { prisma } = await import("@/lib/prisma");
  const { canSendMail, createMailTransport, getMailFrom } = await import("@/lib/mailer");
  const { collectReminderNotifications } = await import("@/lib/reminder-notifications");

  const settings = await prisma.appSetting.findUnique({ where: { id: 1 } });

  if (!settings?.emailNotificationsEnabled || !settings.notificationEmail) {
    console.log("[task] skip reminder email: disabled or no recipient");
    return;
  }

  if (!canSendMail(settings)) {
    console.log("[task] skip reminder email: smtp config missing");
    return;
  }

  const reminders = await prisma.reminder.findMany({
    where: { deletedAt: null, completedAt: null },
    orderBy: { dueAt: "asc" },
  });

  const notifications = collectReminderNotifications(reminders, new Date());

  if (notifications.length === 0) {
    console.log("[task] no reminders to send");
    return;
  }

  const transport = createMailTransport(settings);
  let sent = 0;

  for (const notification of notifications) {
    const reminder = reminders.find((item) => item.id === notification.id);
    if (!reminder) continue;

    const subjectPrefix = notification.kind === "upcoming" ? "即将到期提醒" : "已超期提醒";
    const intro =
      notification.kind === "upcoming"
        ? "这条提醒已经进入提醒窗口，请尽快处理。"
        : "这条提醒已经超期，请尽快处理。";

    await transport.sendMail({
      from: getMailFrom(settings),
      to: settings.notificationEmail,
      subject: `${subjectPrefix}｜${reminder.title}`,
      text: [
        `${settings.appName} - ${subjectPrefix}`,
        "",
        intro,
        `标题：${reminder.title}`,
        reminder.activationCode ? `激活码：${reminder.activationCode}` : null,
        reminder.activationContact ? `联系方式：${reminder.activationContact}` : null,
        `分类：${reminder.category ?? "未分类"}`,
        `截止时间：${reminder.dueAt.toLocaleString("zh-CN", { hour12: false })}`,
        reminder.description ? `说明：${reminder.description}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    });

    await prisma.reminder.update({
      where: { id: reminder.id },
      data:
        notification.kind === "upcoming"
          ? { upcomingNotifiedAt: new Date() }
          : { overdueNotifiedAt: new Date() },
    });

    sent += 1;
  }

  console.log(`[task] sent ${sent} reminder emails`);
}

// ── 调度器核心 ───────────────────────────────
const REGISTERED_TASKS: RegisteredTask[] = [
  { name: "inventory-check", label: "库存通知检查", fn: inventoryCheck, intervalKey: "inventoryCheckInterval", enabledKey: "inventoryCheckEnabled" },
  { name: "reminder-email", label: "到期提醒邮件", fn: reminderEmailDispatch, intervalKey: "reminderEmailInterval", enabledKey: "reminderEmailEnabled" },
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
    heartbeat(); // 无论成功失败都打心跳
  }
}

/** 根据数据库配置重置所有定时器 */
export async function refreshAllTimers() {
  // 先清空旧定时器
  for (const timer of timers.values()) {
    clearInterval(timer);
  }
  timers.clear();

  const settings = await prisma.appSetting.findUnique({ where: { id: 1 } });
  if (!settings) return;

  // 启动看门狗（只启一次）
  if (!watchdogStarted) {
    watchdogStarted = true;
    watchdogLoop();
  }

  for (const task of REGISTERED_TASKS) {
    const enabled = settings[task.enabledKey] !== false;
    const sec = settings[task.intervalKey] ?? 60;

    if (!enabled) {
      console.log(`[scheduler] ${task.label} 已禁用，跳过`);
      continue;
    }

    const ms = sec * 1000;
    console.log(`[scheduler] ${task.label} 每 ${sec} 秒执行一次`);

    // 注册周期定时器
    const timer = setInterval(() => {
      runTask(task).catch((err) => console.error(`[scheduler] ${task.name} 定时器异常:`, err));
    }, ms);
    timers.set(task.name, timer);
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
