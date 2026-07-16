export const REMINDER_GROUPS = [
  "授权与店铺",
  "服务器与证书",
  "账单与续费",
  "宠物健康",
  "日常生活",
  "工作与项目",
  "其他",
] as const;

export type ReminderGroup = (typeof REMINDER_GROUPS)[number];
export type ReminderGroupFilter = "all" | ReminderGroup;

const categoryAliases: Record<string, ReminderGroup> = {
  授权与店铺: "授权与店铺",
  激活码: "授权与店铺",
  授权: "授权与店铺",
  店铺: "授权与店铺",
  服务器与证书: "服务器与证书",
  SSL证书: "服务器与证书",
  证书: "服务器与证书",
  域名: "服务器与证书",
  服务器: "服务器与证书",
  账单与续费: "账单与续费",
  账单: "账单与续费",
  续费: "账单与续费",
  宠物健康: "宠物健康",
  宠物: "宠物健康",
  日常生活: "日常生活",
  生活: "日常生活",
  工作与项目: "工作与项目",
  工作: "工作与项目",
  项目: "工作与项目",
  其他: "其他",
};

export function getReminderGroup(category: string | null | undefined): ReminderGroup {
  const normalized = category?.trim();
  return normalized ? categoryAliases[normalized] ?? "其他" : "其他";
}

export function groupReminderItems<T extends { category: string | null }>(items: T[]) {
  const buckets = new Map<ReminderGroup, T[]>(REMINDER_GROUPS.map((group) => [group, []]));
  for (const item of items) buckets.get(getReminderGroup(item.category))?.push(item);
  return REMINDER_GROUPS
    .map((name) => ({ name, items: buckets.get(name) ?? [] }))
    .filter((group) => group.items.length > 0);
}
