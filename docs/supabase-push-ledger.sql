-- Supabase 推送台账表
-- 在 Supabase SQL Editor 中执行本文件后，应用会在配置 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 时自动同步 PushLedger。

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

create index if not exists push_ledgers_created_at_idx on public.push_ledgers(created_at desc);
create index if not exists push_ledgers_status_idx on public.push_ledgers(status);
create index if not exists push_ledgers_channel_type_idx on public.push_ledgers(channel_type);
create index if not exists push_ledgers_business_id_idx on public.push_ledgers(business_id);
create index if not exists push_ledgers_notification_id_idx on public.push_ledgers(notification_id);

alter table public.push_ledgers enable row level security;

-- 仅服务端 service role 写入/更新；前端匿名 key 默认不开放读取。
-- 如需在 Supabase Dashboard 外直接读取，可按实际需要创建 authenticated 只读策略。
