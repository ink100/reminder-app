type PushLedgerItem = {
  id: string;
  title: string;
  content: string;
  channelType: string;
  channelName: string;
  target: string | null;
  status: string;
  retryCount: number;
  attemptCount: number;
  error: string | null;
  durationMs: number | null;
  createdAt: Date;
  queuedAt: Date;
  startedAt: Date | null;
  sentAt: Date | null;
  failedAt: Date | null;
  lastRetryAt: Date | null;
  businessType: string | null;
  businessId: string | null;
};

const statusStyles: Record<string, string> = {
  Pending: "bg-slate-100 text-slate-700",
  Processing: "bg-blue-100 text-blue-700",
  Success: "bg-emerald-100 text-emerald-700",
  RetryWaiting: "bg-amber-100 text-amber-700",
  Failed: "bg-red-100 text-red-700",
  DeadLetter: "bg-red-100 text-red-700",
  Cancelled: "bg-slate-200 text-slate-600",
};

function formatTime(value: Date | null) {
  return value ? value.toLocaleString("zh-CN", { hour12: false }) : "-";
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    Pending: "待推送",
    Processing: "推送中",
    Success: "推送成功",
    RetryWaiting: "等待重试",
    Failed: "推送失败",
    DeadLetter: "最终失败",
    Cancelled: "已取消",
  };
  return labels[status] ?? status;
}

export function PushLedgerDashboard({ items, stats }: { items: PushLedgerItem[]; stats: { total: number; success: number; pending: number; failed: number } }) {
  return (
    <div className="min-w-0 space-y-6">
      <div>
        <p className="text-sm font-medium text-blue-600">Push Ledger</p>
        <h1 className="text-2xl font-semibold text-slate-950">推送台账</h1>
        <p className="mt-1 text-sm text-slate-500">记录每一次推送的内容、时间、渠道、状态、重试与错误信息，方便审计和排查。</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["台账总数", stats.total],
          ["推送成功", stats.success],
          ["待处理/重试", stats.pending],
          ["失败/死信", stats.failed],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <h2 className="font-semibold text-slate-950">最近推送记录</h2>
          <p className="mt-1 text-xs text-slate-500">默认展示最近 100 条。完整数据也可通过 `/api/push-ledger` 查询。</p>
        </div>
        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <article key={item.id} className="min-w-0 p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words font-medium text-slate-950">{item.title}</h3>
                    <span className={`rounded-full px-2 py-1 text-xs ${statusStyles[item.status] ?? "bg-slate-100 text-slate-700"}`}>{getStatusLabel(item.status)}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{item.channelName} / {item.channelType}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{item.content}</p>
                  {item.error ? <p className="mt-2 break-all rounded-lg bg-red-50 p-3 text-sm text-red-700">错误：{item.error}</p> : null}
                </div>
                <div className="w-full min-w-0 shrink-0 space-y-1 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600 lg:w-72">
                  <p className="break-all">目标：{item.target || "-"}</p>
                  <p className="break-all">业务：{item.businessType || "-"} / {item.businessId || "-"}</p>
                  <p>创建时间：{formatTime(item.createdAt)}</p>
                  <p>排队时间：{formatTime(item.queuedAt)}</p>
                  <p>开始时间：{formatTime(item.startedAt)}</p>
                  <p>成功时间：{formatTime(item.sentAt)}</p>
                  <p>失败时间：{formatTime(item.failedAt)}</p>
                  <p>最后重试：{formatTime(item.lastRetryAt)}</p>
                  <p>尝试/重试：{item.attemptCount} / {item.retryCount}</p>
                  <p>耗时：{item.durationMs == null ? "-" : `${item.durationMs}ms`}</p>
                </div>
              </div>
            </article>
          ))}
          {items.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">暂无推送台账</p> : null}
        </div>
      </section>
    </div>
  );
}
