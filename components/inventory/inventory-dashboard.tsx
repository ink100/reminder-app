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
      matched: items.filter((item) => item.matchedOwnerShopName).length,
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
      setMessage("库存已刷新");
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

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">现在只显示普货店主商品；群主店同款只做匹配参考，不单独占一行。</p>
          <p className="text-sm text-slate-500">共 {summary.total} 个普货店商品，已开启通知 {summary.enabled} 个，匹配到群主店同款 {summary.matched} 个。</p>
        </div>
        <Button type="button" disabled={refreshing} onClick={handleRefresh}>
          {refreshing ? "刷新中..." : "立即抓取两家库存"}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-3 py-3">主店铺</th>
              <th className="px-3 py-3">商品名称</th>
              <th className="px-3 py-3">普货店库存</th>
              <th className="px-3 py-3">群主店同款</th>
              <th className="px-3 py-3">最小通知</th>
              <th className="px-3 py-3">最大通知</th>
              <th className="px-3 py-3">是否通知</th>
              <th className="px-3 py-3">最近抓取</th>
              <th className="px-3 py-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 align-top">
                <td className="px-3 py-3 text-slate-600">{item.sourceLabel}</td>
                <td className="px-3 py-3">
                  <div className="font-medium text-slate-900">{item.name}</div>
                  {item.productUrl ? (
                    <a className="text-xs text-blue-600 hover:underline" href={item.productUrl} rel="noreferrer" target="_blank">
                      打开普货店商品
                    </a>
                  ) : null}
                </td>
                <td className="px-3 py-3 font-medium text-slate-900">{item.stock}</td>
                <td className="px-3 py-3 text-slate-600">
                  {item.matchedOwnerShopName ? (
                    <div className="space-y-1">
                      <div>{item.matchedOwnerShopStock ?? 0}</div>
                      <div className="text-xs text-slate-500">{item.matchedOwnerShopName}</div>
                      {item.matchedOwnerShopUrl ? (
                        <a className="text-xs text-blue-600 hover:underline" href={item.matchedOwnerShopUrl} rel="noreferrer" target="_blank">
                          打开群主店同款
                        </a>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-slate-400">未匹配</span>
                  )}
                </td>
                <td className="px-3 py-3 w-32">
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
                <td className="px-3 py-3 w-32">
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
                <td className="px-3 py-3 text-slate-600">
                  <div>普货店：{formatFetchedAt(item.lastFetchedAt)}</div>
                  <div className="text-xs text-slate-500">群主店：{formatFetchedAt(item.matchedOwnerShopLastFetchedAt)}</div>
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

      <p className="text-sm text-slate-500">{message ?? "定时建议：普货店 1 分钟同步一次，群主店 3 分钟同步一次；通知只按普货店主商品库存判断。"}</p>
    </div>
  );
}
