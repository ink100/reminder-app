"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InventoryWatchListItem } from "@/lib/inventory-service";

type InventoryDashboardProps = {
  initialItems: InventoryWatchListItem[];
};

type ItemState = InventoryWatchListItem & {
  saving?: boolean;
};

function formatFetchedAt(value: string | null) {
  if (!value) {
    return "未抓取";
  }

  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function InventoryDashboard({ initialItems }: InventoryDashboardProps) {
  const [items, setItems] = useState<ItemState[]>(initialItems);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const summary = useMemo(() => {
    return {
      total: items.length,
      enabled: items.filter((item) => item.notifyEnabled).length,
    };
  }, [items]);

  async function handleRefresh() {
    setRefreshing(true);
    setMessage(null);

    try {
      const response = await fetch("/api/inventory/refresh", { method: "POST" });
      const data = (await response.json()) as { error?: string; items?: InventoryWatchListItem[] };

      if (!response.ok) {
        throw new Error(data.error ?? "刷新库存失败");
      }

      setItems(data.items ?? []);
      setMessage("列表已刷新");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "刷新库存失败");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSave(item: ItemState) {
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, saving: true } : entry)));
    setMessage(null);

    try {
      const response = await fetch(`/api/inventory/${item.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notifyEnabled: item.notifyEnabled,
          minNotifyStock: Number(item.minNotifyStock),
          maxNotifyStock: Number(item.maxNotifyStock),
          notifyCooldownMin: Number(item.notifyCooldownMin),
          changePercent: Number(item.changePercent),
          changePercentAuto: item.changePercentAuto,
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "保存配置失败");
      }

      setMessage(`已保存：${item.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存配置失败");
    } finally {
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, saving: false } : entry)));
    }
  }

  async function handleAutoChange(item: ItemState, auto: boolean) {
    const updated = items.map((entry) =>
      entry.id === item.id ? { ...entry, changePercentAuto: auto, changePercent: auto ? 5 : entry.changePercent } : entry,
    );
    setItems(updated);
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">共 {summary.total} 个商品，已开启通知 {summary.enabled} 个。</p>
        </div>
        <Button type="button" disabled={refreshing} onClick={handleRefresh}>
          {refreshing ? "刷新中..." : "刷新列表"}
        </Button>
      </div>

      <p className="text-xs text-slate-400">
        通知时段可在设置页修改｜冷却期内库存小波动不重复通知，大幅波动时忽略冷却期。
      </p>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-3 py-3">商品名称</th>
              <th className="px-3 py-3">库存</th>
              <th className="px-3 py-3">最小通知</th>
              <th className="px-3 py-3">最大通知</th>
              <th className="px-3 py-3">通知</th>
              <th className="px-3 py-3">波动幅度</th>
              <th className="px-3 py-3">冷却期(分)</th>
              <th className="px-3 py-3">最近抓取</th>
              <th className="px-3 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 align-top">
                <td className="px-3 py-3">
                  <div className="font-medium text-slate-900">{item.name}</div>
                  {item.productUrl ? (
                    <a className="text-xs text-blue-600 hover:underline" href={item.productUrl} rel="noreferrer" target="_blank">
                      打开商品
                    </a>
                  ) : null}
                </td>
                <td className="px-3 py-3 font-medium text-slate-900">{item.stock}</td>
                <td className="px-3 py-3 w-24">
                  <Input
                    type="number"
                    min={0}
                    max={99999}
                    value={item.minNotifyStock}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((entry) =>
                          entry.id === item.id ? { ...entry, minNotifyStock: Number(event.target.value || 0) } : entry,
                        ),
                      )
                    }
                  />
                </td>
                <td className="px-3 py-3 w-24">
                  <Input
                    type="number"
                    min={0}
                    max={99999}
                    value={item.maxNotifyStock}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((entry) =>
                          entry.id === item.id ? { ...entry, maxNotifyStock: Number(event.target.value || 0) } : entry,
                        ),
                      )
                    }
                  />
                </td>
                <td className="px-3 py-3">
                  <label className="flex items-center gap-2 text-slate-700">
                    <input
                      type="checkbox"
                      checked={item.notifyEnabled}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((entry) =>
                            entry.id === item.id ? { ...entry, notifyEnabled: event.target.checked } : entry,
                          ),
                        )
                      }
                    />
                    开启
                  </label>
                </td>
                <td className="px-3 py-3 w-24">
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={item.changePercent}
                      disabled={item.changePercentAuto}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((entry) =>
                            entry.id === item.id ? { ...entry, changePercent: Number(event.target.value || 5) } : entry,
                          ),
                        )
                      }
                    />
                    <span className="text-xs text-slate-400">%</span>
                  </div>
                  <label className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={item.changePercentAuto}
                      onChange={(event) => handleAutoChange(item, event.target.checked)}
                    />
                    自动
                  </label>
                </td>
                <td className="px-3 py-3 w-24">
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={item.notifyCooldownMin}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((entry) =>
                          entry.id === item.id ? { ...entry, notifyCooldownMin: Number(event.target.value || 120) } : entry,
                        ),
                      )
                    }
                  />
                </td>
                <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                  {formatFetchedAt(item.lastFetchedAt)}
                </td>
                <td className="px-3 py-3">
                  <Button type="button" disabled={item.saving} onClick={() => handleSave(item)}>
                    {item.saving ? "保存中..." : "保存"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-slate-500">{message ?? ""}</p>
    </div>
  );
}
