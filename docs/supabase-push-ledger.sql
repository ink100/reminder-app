-- Supabase 推送台账表（兼容旧入口）
-- 更完整的 NoticeManager 全量建表 + 数据库级注释请使用：docs/supabase-notice-manager.sql
-- 如果只需要单独创建 push_ledgers，可执行本文件。

begin;

create table if not exists public.push_ledgers (
  id text primary key,
  notification_id text,
  queue_job_id text unique,
  channel_id text,
  channel_type text not null,
  channel_name text not null,
  target text,
  title text not null,
  content text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  business_type text,
  business_id text,
  status text not null default 'Pending',
  retry_count integer not null default 0,
  attempt_count integer not null default 0,
  request jsonb,
  response jsonb,
  error text,
  duration_ms integer,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  last_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.push_ledgers is 'NoticeManager 推送台账表：面向运营审计的一行一推送记录，保存推送内容、渠道、状态、时间、错误和业务关联。';
comment on column public.push_ledgers.id is '台账 ID，对应本地 PushLedger.id。';
comment on column public.push_ledgers.notification_id is '关联通知 ID。';
comment on column public.push_ledgers.queue_job_id is '关联队列任务 ID，一般一条队列任务对应一条台账。';
comment on column public.push_ledgers.channel_id is '关联渠道 ID。';
comment on column public.push_ledgers.channel_type is '渠道类型快照，例如 Telegram、Email、Webhook。';
comment on column public.push_ledgers.channel_name is '渠道名称快照。';
comment on column public.push_ledgers.target is '推送目标，例如 chatId、邮箱地址、Webhook URL。';
comment on column public.push_ledgers.title is '推送标题快照。';
comment on column public.push_ledgers.content is '实际渲染后的推送内容。';
comment on column public.push_ledgers.raw_payload is '原始业务 payload 快照。';
comment on column public.push_ledgers.business_type is '业务类型，例如 order、license、ssl、inventory。';
comment on column public.push_ledgers.business_id is '业务 ID，例如订单号、授权码 ID、提醒 ID。';
comment on column public.push_ledgers.status is '推送状态：Pending、Processing、Success、RetryWaiting、Failed、DeadLetter、Cancelled。';
comment on column public.push_ledgers.retry_count is '重试次数。';
comment on column public.push_ledgers.attempt_count is '实际发送尝试次数。';
comment on column public.push_ledgers.request is '最近一次发送请求 JSON。';
comment on column public.push_ledgers.response is '最近一次发送响应 JSON。';
comment on column public.push_ledgers.error is '最近一次错误信息。';
comment on column public.push_ledgers.duration_ms is '最近一次发送耗时，单位毫秒。';
comment on column public.push_ledgers.queued_at is '进入待推送队列时间。';
comment on column public.push_ledgers.started_at is '最近一次开始发送时间。';
comment on column public.push_ledgers.sent_at is '发送成功时间。';
comment on column public.push_ledgers.failed_at is '最终失败或失败发生时间。';
comment on column public.push_ledgers.last_retry_at is '最后一次进入重试等待的时间。';
comment on column public.push_ledgers.created_at is '台账创建时间。';
comment on column public.push_ledgers.updated_at is '台账最后更新时间。';

create index if not exists push_ledgers_created_at_idx on public.push_ledgers(created_at desc);
create index if not exists push_ledgers_status_idx on public.push_ledgers(status);
create index if not exists push_ledgers_channel_type_idx on public.push_ledgers(channel_type);
create index if not exists push_ledgers_business_id_idx on public.push_ledgers(business_id);
create index if not exists push_ledgers_notification_id_idx on public.push_ledgers(notification_id);

alter table public.push_ledgers enable row level security;

commit;

-- 仅服务端 service role 写入/更新；前端匿名 key 默认不开放读取。
-- 如需在 Supabase Dashboard 外直接读取，可按实际需要创建 authenticated 只读策略。
