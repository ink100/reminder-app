import type { ActorRole } from "../types/api";

export interface NavigationItem {
  href: string;
  label: string;
  shortLabel: string;
}

const sharedItems: readonly NavigationItem[] = [
  { href: "/reminders", label: "提醒首页", shortLabel: "提醒" },
  { href: "/todos", label: "待办事项", shortLabel: "待办" },
  { href: "/medicines", label: "药品管理", shortLabel: "药品" },
  { href: "/images", label: "文件管理", shortLabel: "文件" },
  { href: "/account", label: "账户安全", shortLabel: "账户" },
];

const adminItems: readonly NavigationItem[] = [
  { href: "/members", label: "成员管理", shortLabel: "成员" },
  { href: "/notification-center", label: "通知管理", shortLabel: "通知" },
  { href: "/push-ledger", label: "推送台账", shortLabel: "台账" },
  { href: "/license-key", label: "激活密匙", shortLabel: "密匙" },
  { href: "/ssl", label: "SSL 证书", shortLabel: "SSL" },
  { href: "/bot", label: "Bot 通知", shortLabel: "Bot" },
  { href: "/settings", label: "配置中心", shortLabel: "设置" },
];

export function getNavigationItems(role: ActorRole | null | undefined): NavigationItem[] {
  if (role === "MEMBER") return [...sharedItems];
  if (role === "ADMIN") return [...sharedItems, ...adminItems];
  return [];
}

export function useNavigation(role: MaybeRefOrGetter<ActorRole | null | undefined>) {
  const route = useRoute();
  const items = computed(() => getNavigationItems(toValue(role)));
  const isActive = (href: string) => route.path === href || route.path.startsWith(`${href}/`);
  return { items, isActive };
}
