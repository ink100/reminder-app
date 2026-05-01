export type InventoryNotificationCandidate = {
  id: string;
  name: string;
  sourceLabel: string;
  stock: number;
  notifyEnabled: boolean;
  minNotifyStock: number;
  maxNotifyStock: number;
  lastRangeMatched: boolean;
  lastNotifiedStock: number | null;
  lastNotifiedAt: string | null;
  notifyCooldownMin: number;
  changePercent: number;
  changePercentAuto: boolean;
};

export type InventoryNotificationContext = {
  now: Date;
  notifyStartHour: number;
  notifyEndHour: number;
};

export function isInventoryInRange(
  item: Pick<InventoryNotificationCandidate, "stock" | "minNotifyStock" | "maxNotifyStock">,
) {
  return item.stock >= item.minNotifyStock && item.stock <= item.maxNotifyStock;
}

/**
 * 自适应计算新的 changePercent
 * 如果这次变化幅度大于当前阈值，抬高阈值（大幅波动后避免频繁通知）
 * 如果变化幅度很小，缓慢回归默认值
 */
export function adaptChangePercent(
  currentPercent: number,
  changePercentAuto: boolean,
  currentStock: number,
  lastNotifiedStock: number | null,
  defaultPercent: number = 5,
): number {
  if (!changePercentAuto || lastNotifiedStock === null || lastNotifiedStock === currentStock) {
    return currentPercent;
  }

  const maxStock = Math.max(currentStock, lastNotifiedStock);
  if (maxStock === 0) return currentPercent;

  const changeRatio = Math.abs(currentStock - lastNotifiedStock) / maxStock;
  const changePercent = Math.round(changeRatio * 100);

  if (changePercent > currentPercent) {
    // 大幅波动 → 阈值抬高到 80%
    return Math.max(currentPercent, Math.round(changePercent * 0.8));
  } else {
    // 小幅波动 → 阈值缓慢回归默认值（每次降 5%）
    const decayed = Math.round(currentPercent * 0.95);
    return Math.max(defaultPercent, decayed);
  }
}

/**
 * 判断是否需要发送通知
 * 三个条件同时满足才通知：
 * 1. 在通知时间段内
 * 2. 库存落在配置范围内
 * 3. 变化幅度 >= changePercent，或者超过冷却期
 */
export function shouldNotifyItem(
  item: InventoryNotificationCandidate,
  ctx: InventoryNotificationContext,
): boolean {
  if (!item.notifyEnabled) return false;
  if (!isInventoryInRange(item)) return false;

  const hour = ctx.now.getHours();

  // 1. 时间段检查
  if (ctx.notifyStartHour <= ctx.notifyEndHour) {
    // 正常区间: 9~22
    if (hour < ctx.notifyStartHour || hour >= ctx.notifyEndHour) return false;
  } else {
    // 跨天区间: 22~6 (notifyStartHour > notifyEndHour)
    if (hour >= ctx.notifyEndHour && hour < ctx.notifyStartHour) return false;
  }

  // 2. 冷却期检查
  if (item.lastNotifiedAt) {
    const lastNotifiedDate = new Date(item.lastNotifiedAt);
    const elapsedMin = (ctx.now.getTime() - lastNotifiedDate.getTime()) / (1000 * 60);

    if (elapsedMin < item.notifyCooldownMin) {
      // 冷却期内 → 只有波动幅度超过阈值才通知
      if (item.lastNotifiedStock !== null && item.lastNotifiedStock !== item.stock) {
        const maxStock = Math.max(item.stock, item.lastNotifiedStock);
        if (maxStock > 0) {
          const changeRatio = Math.abs(item.stock - item.lastNotifiedStock) / maxStock;
          const changePercent = Math.round(changeRatio * 100);
          if (changePercent >= item.changePercent) {
            return true; // 冷却期内但大幅波动
          }
        }
      }
      return false; // 冷却期内且波动不大，跳过
    }
  }

  // 冷却期已过或从未通知过
  // 必须检查库存是否有变化，避免库存不变时重复通知
  if (item.lastNotifiedStock !== null && item.lastNotifiedStock === item.stock) {
    return false; // 库存没变，不发通知
  }

  return true; // 库存有变化或首次通知
}

/**
 * 收集需要通知的商品列表
 * 返回 { id, stock } 列表
 */
export function collectInventoryNotifications(
  items: InventoryNotificationCandidate[],
  ctx: InventoryNotificationContext,
): { id: string; stock: number }[] {
  return items.filter((item) => shouldNotifyItem(item, ctx)).map((item) => ({ id: item.id, stock: item.stock }));
}
