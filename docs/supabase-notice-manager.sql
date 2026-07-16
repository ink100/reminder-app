-- NoticeManager / Notification Center Supabase schema
-- 用途：在 Supabase/PostgreSQL 中创建通知中心全量表，并为每张表、每个字段写入数据库级 COMMENT。
-- 执行位置：Supabase SQL Editor，或使用 psql 连接 Supabase Postgres 后执行。
-- 注意：通知模块已切换为 Supabase 直连读写；本 SQL 用于 Supabase 侧建表和审计字段说明。
-- AI/运维执行：设置 SUPABASE_DB_URL 后运行 `npm run supabase:notice-manager:apply` 可执行本文件。

begin;

create table if not exists public.notification_events (
  id text primary key,
  source text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.notification_events is 'NoticeManager 事件源表：保存外部 Worker、系统任务或业务模块提交的原始事件，是通知生成的输入来源。';
comment on column public.notification_events.id is '事件 ID，对应本地 NotificationEvent.id。';
comment on column public.notification_events.source is '事件来源，例如 worker、server、ssl、inventory、manual 等。';
comment on column public.notification_events.event_type is '事件类型，例如 reminder_due、ssl_expiring、stock_changed 等。';
comment on column public.notification_events.payload is '原始事件载荷 JSON；只在事件表保存，避免 notifications 表重复存储大 payload。';
comment on column public.notification_events.created_at is '事件创建时间。';

create table if not exists public.notification_groups (
  id text primary key,
  name text not null unique,
  description text,
  enabled boolean not null default true
);

comment on table public.notification_groups is 'NoticeManager 通知分组表：定义通知归属分组，用于路由、启停和管理。';
comment on column public.notification_groups.id is '分组 ID，对应本地 NotificationGroup.id。';
comment on column public.notification_groups.name is '分组唯一名称，例如 server、ops、business。';
comment on column public.notification_groups.description is '分组说明。';
comment on column public.notification_groups.enabled is '分组是否启用；禁用后不应继续创建或派发该分组通知。';

create table if not exists public.notifications (
  id text primary key,
  event_id text references public.notification_events(id) on delete set null,
  group_id text not null references public.notification_groups(id) on delete restrict,
  title text not null,
  summary text,
  priority integer not null default 2,
  status text not null default 'Created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.notifications is 'NoticeManager 通知聚合根表：保存一条业务通知的标题、摘要、优先级和最终一致状态。';
comment on column public.notifications.id is '通知 ID，对应本地 Notification.id。';
comment on column public.notifications.event_id is '关联事件 ID；事件清理后可置空。';
comment on column public.notifications.group_id is '通知分组 ID。';
comment on column public.notifications.title is '通知标题。';
comment on column public.notifications.summary is '通知摘要。';
comment on column public.notifications.priority is '通知优先级，数值越小越优先；默认 2。';
comment on column public.notifications.status is '通知最终一致状态缓存：Created、Queued、Processing、Completed、Failed、Cancelled。';
comment on column public.notifications.created_at is '通知创建时间。';
comment on column public.notifications.updated_at is '通知最后更新时间。';

create table if not exists public.notification_channels (
  id text primary key,
  type text not null,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notification_channels add column if not exists is_default boolean not null default false;

comment on table public.notification_channels is 'NoticeManager 渠道表：保存 Telegram、Email、Webhook 等发送渠道定义和非敏感配置。';
comment on column public.notification_channels.id is '渠道 ID，对应本地 NotificationChannel.id。';
comment on column public.notification_channels.type is '渠道类型，例如 Telegram、Email、Webhook、Bark、Discord、Slack、WeCom。';
comment on column public.notification_channels.name is '渠道显示名称。';
comment on column public.notification_channels.config is '渠道配置 JSON；敏感值建议只存引用或加密值，不要明文暴露。';
comment on column public.notification_channels.enabled is '渠道是否启用；停用时所有分组均停止使用该渠道。';
comment on column public.notification_channels.is_default is '是否属于默认配置；分组未配置该渠道时仅继承默认渠道。';
comment on column public.notification_channels.created_at is '渠道创建时间。';

create table if not exists public.notification_templates (
  id text primary key,
  name text not null,
  channel_type text not null,
  content text not null,
  enabled boolean not null default true,
  group_id text references public.notification_groups(id) on delete set null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_templates add column if not exists group_id text references public.notification_groups(id) on delete set null;
alter table public.notification_templates add column if not exists is_default boolean not null default false;
alter table public.notification_templates add column if not exists created_at timestamptz not null default now();
alter table public.notification_templates add column if not exists updated_at timestamptz not null default now();

comment on table public.notification_templates is 'NoticeManager 模板表：保存不同渠道的消息模板，派发时按模板进行即时渲染。';
comment on column public.notification_templates.id is '模板 ID，对应本地 NotificationTemplate.id。';
comment on column public.notification_templates.name is '模板名称。';
comment on column public.notification_templates.channel_type is '模板适用渠道类型。';
comment on column public.notification_templates.content is '模板内容，支持 {{title}}、{{summary}}、{{payload.xxx}}、{{json}} 等占位符。';
comment on column public.notification_templates.enabled is '模板是否启用。';
comment on column public.notification_templates.group_id is '模板所属分组；空表示默认/共享模板，非空表示该组的自定义模板。';
comment on column public.notification_templates.is_default is '是否为该渠道类型的默认模板；仅全局模板可以设为默认。';
comment on column public.notification_templates.created_at is '模板创建时间。';
comment on column public.notification_templates.updated_at is '模板最后更新时间。';

create table if not exists public.notification_group_routes (
  group_id text not null references public.notification_groups(id) on delete cascade,
  channel_id text not null references public.notification_channels(id) on delete cascade,
  mode text not null check (mode in ('custom', 'disabled')),
  config_override jsonb not null default '{}'::jsonb,
  template_id text references public.notification_templates(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, channel_id)
);

comment on table public.notification_group_routes is '通知分组渠道覆盖表：无记录表示继承默认配置，custom 表示分组自定义，disabled 表示明确禁用且不回退。';
comment on column public.notification_group_routes.group_id is '通知分组 ID。';
comment on column public.notification_group_routes.channel_id is '被覆盖的渠道 ID。';
comment on column public.notification_group_routes.mode is 'custom 使用分组覆盖；disabled 明确禁用。恢复继承时删除该行。';
comment on column public.notification_group_routes.config_override is '组级渠道配置覆盖，按字段合并到默认渠道配置；敏感值不得返回浏览器。';
comment on column public.notification_group_routes.template_id is '组级自定义模板；空表示继续使用该渠道类型的默认模板。';
comment on column public.notification_group_routes.created_at is '覆盖配置创建时间。';
comment on column public.notification_group_routes.updated_at is '覆盖配置最后更新时间。';

create table if not exists public.notification_api_keys (
  id text primary key,
  name text not null,
  api_key text not null unique,
  enabled boolean not null default true,
  expires_at timestamptz
);

comment on table public.notification_api_keys is 'NoticeManager API Key 表：保存外部 Worker 调用通知入口所需的 API Key 元数据。';
comment on column public.notification_api_keys.id is 'API Key 记录 ID，对应本地 NotificationApiKey.id。';
comment on column public.notification_api_keys.name is 'API Key 显示名称或用途说明。';
comment on column public.notification_api_keys.api_key is 'API Key 明文或迁移期兼容值；生产建议改为哈希存储。';
comment on column public.notification_api_keys.enabled is 'API Key 是否启用。';
comment on column public.notification_api_keys.expires_at is 'API Key 过期时间，空表示不过期。';

create table if not exists public.queue_jobs (
  id text primary key,
  notification_id text not null references public.notifications(id) on delete cascade,
  channel_id text not null references public.notification_channels(id) on delete restrict,
  template_id text not null references public.notification_templates(id) on delete restrict,
  channel_config jsonb,
  rendered_content text,
  priority integer not null default 2,
  retry_count integer not null default 0,
  max_retry integer not null default 5,
  status text not null default 'Pending',
  next_execute_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.queue_jobs add column if not exists channel_config jsonb;
alter table public.queue_jobs add column if not exists rendered_content text;

comment on table public.queue_jobs is 'NoticeManager 队列表：每条通知在每个渠道上的发送任务，QueueJob.status 是发送状态权威来源。';
comment on column public.queue_jobs.id is '队列任务 ID，对应本地 QueueJob.id。';
comment on column public.queue_jobs.notification_id is '所属通知 ID。';
comment on column public.queue_jobs.channel_id is '发送渠道 ID。';
comment on column public.queue_jobs.template_id is '发送模板 ID。';
comment on column public.queue_jobs.channel_config is '任务创建时解析出的最终渠道配置快照；历史任务为空时回退渠道当前配置。';
comment on column public.queue_jobs.rendered_content is '任务创建时渲染的消息内容快照，确保后续模板修改不改变已入队消息。';
comment on column public.queue_jobs.priority is '任务优先级，数值越小越优先。';
comment on column public.queue_jobs.retry_count is '已重试次数。';
comment on column public.queue_jobs.max_retry is '最大重试次数。';
comment on column public.queue_jobs.status is '任务状态：Pending、Processing、RetryWaiting、Success、DeadLetter。';
comment on column public.queue_jobs.next_execute_at is '下一次允许执行时间，用于延迟重试。';
comment on column public.queue_jobs.locked_at is '任务被派发器锁定的时间。';
comment on column public.queue_jobs.last_error is '最近一次失败错误信息。';
comment on column public.queue_jobs.created_at is '任务创建时间。';
comment on column public.queue_jobs.updated_at is '任务最后更新时间。';

create table if not exists public.send_logs (
  id text primary key,
  queue_job_id text not null references public.queue_jobs(id) on delete cascade,
  request jsonb not null default '{}'::jsonb,
  response jsonb not null default '{}'::jsonb,
  result text not null,
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.send_logs is 'NoticeManager 发送日志表：记录每次队列任务尝试发送的请求、响应、结果和耗时，属于审计/排错数据。';
comment on column public.send_logs.id is '发送日志 ID，对应本地 SendLog.id。';
comment on column public.send_logs.queue_job_id is '关联队列任务 ID。';
comment on column public.send_logs.request is '本次发送请求信息 JSON，包括渠道类型和渲染后的消息。';
comment on column public.send_logs.response is '本次发送响应信息 JSON，包括第三方返回或错误内容。';
comment on column public.send_logs.result is '发送结果：success 或 failed。';
comment on column public.send_logs.duration_ms is '本次发送耗时，单位毫秒。';
comment on column public.send_logs.created_at is '发送日志创建时间。';

create table if not exists public.push_ledgers (
  id text primary key,
  notification_id text references public.notifications(id) on delete set null,
  queue_job_id text unique references public.queue_jobs(id) on delete set null,
  channel_id text references public.notification_channels(id) on delete set null,
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

create table if not exists public.notification_schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

comment on table public.notification_schema_migrations is '通知模块一次性数据迁移标记，避免重复执行兼容性回填。';

do $$
begin
  if not exists (
    select 1 from public.notification_schema_migrations
    where version = 'group-routing-v1'
  ) then
    with ranked_channels as (
      select c.id,
             row_number() over (partition by c.type order by c.created_at asc, c.id asc) as position
      from public.notification_channels c
      where c.enabled
        and not exists (
          select 1 from public.notification_channels configured
          where configured.type = c.type and configured.is_default
        )
    )
    update public.notification_channels channel
    set is_default = true
    from ranked_channels ranked
    where channel.id = ranked.id and ranked.position = 1;

    -- 旧版会向全部启用渠道投递。非默认旧渠道为每个现存分组补建 custom 路由，避免升级后静默漏发。
    insert into public.notification_group_routes (
      group_id,
      channel_id,
      mode,
      config_override,
      template_id
    )
    select groups.id, channels.id, 'custom', '{}'::jsonb, null
    from public.notification_groups groups
    cross join public.notification_channels channels
    where channels.enabled and not channels.is_default
    on conflict (group_id, channel_id) do nothing;

    with ranked_templates as (
      select t.id,
             row_number() over (partition by t.channel_type order by t.name asc, t.id asc) as position
      from public.notification_templates t
      where t.enabled and t.group_id is null
        and not exists (
          select 1 from public.notification_templates configured
          where configured.channel_type = t.channel_type
            and configured.group_id is null
            and configured.is_default
        )
    )
    update public.notification_templates template
    set is_default = true
    from ranked_templates ranked
    where template.id = ranked.id and ranked.position = 1;

    insert into public.notification_schema_migrations(version)
    values ('group-routing-v1');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notification_templates_default_scope_check'
      and conrelid = 'public.notification_templates'::regclass
  ) then
    alter table public.notification_templates
      add constraint notification_templates_default_scope_check
      check (not is_default or group_id is null);
  end if;
end $$;

create or replace function public.prevent_notification_template_scope_change()
returns trigger
language plpgsql
as $$
begin
  if old.group_id is distinct from new.group_id
     or old.channel_type is distinct from new.channel_type then
    raise exception 'notification template scope and channel type are immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.prevent_notification_template_scope_change() is '禁止修改模板所属分组和渠道类型，避免并发更新破坏分组路由引用。';

drop trigger if exists notification_templates_scope_immutable_trigger on public.notification_templates;
create trigger notification_templates_scope_immutable_trigger
before update of group_id, channel_type on public.notification_templates
for each row
execute function public.prevent_notification_template_scope_change();

create index if not exists notification_events_created_at_idx on public.notification_events(created_at desc);
create index if not exists notification_events_source_idx on public.notification_events(source);
create index if not exists notification_events_event_type_idx on public.notification_events(event_type);

create index if not exists notifications_status_idx on public.notifications(status);
create index if not exists notifications_group_id_idx on public.notifications(group_id);
create index if not exists notifications_created_at_idx on public.notifications(created_at desc);
create index if not exists notifications_event_id_idx on public.notifications(event_id);

create index if not exists notification_channels_type_idx on public.notification_channels(type);
create index if not exists notification_channels_enabled_idx on public.notification_channels(enabled);
create unique index if not exists notification_channels_one_default_per_type_idx on public.notification_channels(type) where is_default;

create index if not exists notification_templates_channel_type_idx on public.notification_templates(channel_type);
create index if not exists notification_templates_enabled_idx on public.notification_templates(enabled);
create index if not exists notification_templates_group_id_idx on public.notification_templates(group_id);
create unique index if not exists notification_templates_one_default_per_type_idx on public.notification_templates(channel_type) where is_default and group_id is null;

create index if not exists notification_group_routes_channel_id_idx on public.notification_group_routes(channel_id);
create index if not exists notification_group_routes_template_id_idx on public.notification_group_routes(template_id);

create index if not exists notification_groups_enabled_idx on public.notification_groups(enabled);

create index if not exists notification_api_keys_api_key_idx on public.notification_api_keys(api_key);
create index if not exists notification_api_keys_enabled_idx on public.notification_api_keys(enabled);

create index if not exists queue_jobs_status_idx on public.queue_jobs(status);
create index if not exists queue_jobs_next_execute_at_idx on public.queue_jobs(next_execute_at);
create index if not exists queue_jobs_notification_id_idx on public.queue_jobs(notification_id);
create index if not exists queue_jobs_channel_id_idx on public.queue_jobs(channel_id);

create index if not exists send_logs_queue_job_id_idx on public.send_logs(queue_job_id);
create index if not exists send_logs_created_at_idx on public.send_logs(created_at desc);

create index if not exists push_ledgers_created_at_idx on public.push_ledgers(created_at desc);
create index if not exists push_ledgers_status_idx on public.push_ledgers(status);
create index if not exists push_ledgers_channel_type_idx on public.push_ledgers(channel_type);
create index if not exists push_ledgers_business_id_idx on public.push_ledgers(business_id);
create index if not exists push_ledgers_notification_id_idx on public.push_ledgers(notification_id);
create index if not exists push_ledgers_queue_job_id_idx on public.push_ledgers(queue_job_id);

alter table public.notification_events enable row level security;
alter table public.notification_groups enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_channels enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notification_group_routes enable row level security;
alter table public.notification_schema_migrations enable row level security;
alter table public.notification_api_keys enable row level security;
alter table public.queue_jobs enable row level security;
alter table public.send_logs enable row level security;
alter table public.push_ledgers enable row level security;

notify pgrst, 'reload schema';

commit;

-- 默认不创建匿名/用户读取策略：服务端使用 service role 同步和查询。
-- 如需前端直连 Supabase 读取，请按实际登录体系单独添加 authenticated 只读策略，避免泄露 API Key、渠道配置和发送内容。
