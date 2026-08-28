import type { ActorRole } from "../types/api";

export interface NavigationItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: string;
}

const sharedItems: readonly NavigationItem[] = [
  { href: "/reminders", label: "提醒首页", shortLabel: "提醒", icon: "Bell" },
  { href: "/todos", label: "待办事项", shortLabel: "待办", icon: "CircleCheck" },
  { href: "/medicines", label: "药品管理", shortLabel: "药品", icon: "FirstAidKit" },
  { href: "/images", label: "文件管理", shortLabel: "文件", icon: "FolderOpened" },
  { href: "/account", label: "账户安全", shortLabel: "账户", icon: "Lock" },
];

const adminItems: readonly NavigationItem[] = [
  { href: "/members", label: "成员管理", shortLabel: "成员", icon: "User" },
  { href: "/notification-center", label: "通知管理", shortLabel: "通知", icon: "Message" },
  { href: "/push-ledger", label: "推送台账", shortLabel: "台账", icon: "Tickets" },
  { href: "/license-key", label: "激活密匙", shortLabel: "密匙", icon: "Key" },
  { href: "/ssl", label: "SSL 证书", shortLabel: "SSL", icon: "Connection" },
  { href: "/bot", label: "Bot 通知", shortLabel: "Bot", icon: "ChatDotRound" },
  { href: "/settings", label: "配置中心", shortLabel: "设置", icon: "Setting" },
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
