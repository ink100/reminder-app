import { prisma } from "@/lib/prisma";

const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 5;

function generateBindCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/** 生成一个绑定码，5 分钟有效 */
export async function createBindCode(): Promise<{ code: string; expiresAt: Date }> {
  // 清理过期未使用的绑定码
  await prisma.telegramBindCode.deleteMany({
    where: { expiresAt: { lt: new Date() }, usedAt: null },
  });

  const code = generateBindCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

  await prisma.telegramBindCode.create({
    data: { code, expiresAt },
  });

  return { code, expiresAt };
}

/** 验证绑定码并绑定对应的 chatId */
export async function redeemBindCode(
  code: string,
  chatId: string,
  meta?: { username?: string; firstName?: string },
): Promise<{ success: true; chatId: string } | { success: false; reason: string }> {
  const record = await prisma.telegramBindCode.findUnique({ where: { code } });

  if (!record) {
    return { success: false, reason: "绑定码无效，请检查后重试" };
  }

  if (record.usedAt) {
    return { success: false, reason: "绑定码已被使用" };
  }

  if (record.expiresAt < new Date()) {
    return { success: false, reason: "绑定码已过期，请在 Web 端重新生成" };
  }

  // 标记已使用
  await prisma.telegramBindCode.update({
    where: { id: record.id },
    data: { usedAt: new Date(), chatId },
  });

  // 创建或更新绑定
  await prisma.telegramBinding.upsert({
    where: { chatId },
    update: {
      username: meta?.username ?? null,
      firstName: meta?.firstName ?? null,
      lastActiveAt: new Date(),
      unboundAt: null,
    },
    create: {
      chatId,
      username: meta?.username ?? null,
      firstName: meta?.firstName ?? null,
      lastActiveAt: new Date(),
    },
  });

  return { success: true, chatId };
}

/** 解绑 */
export async function unbindChatId(chatId: string): Promise<void> {
  await prisma.telegramBinding.updateMany({
    where: { chatId, unboundAt: null },
    data: { unboundAt: new Date() },
  });
}

/** 获取所有活跃绑定 */
export async function getActiveBindings() {
  return prisma.telegramBinding.findMany({
    where: { unboundAt: null },
    orderBy: { boundAt: "desc" },
  });
}

/** 获取活跃的 chatId 列表 */
export async function getActiveChatIds(): Promise<string[]> {
  const bindings = await prisma.telegramBinding.findMany({
    where: { unboundAt: null },
    select: { chatId: true },
  });
  return bindings.map((b) => b.chatId);
}
