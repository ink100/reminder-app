-- This file is executed inside the migration's single PostgreSQL transaction.
create table if not exists public.app_settings (
  id integer primary key default 1 check (id = 1),
  app_name text not null default '到期提醒', timezone text not null default 'Asia/Shanghai',
  default_remind_before_days integer not null default 3, default_remind_before_hours integer not null default 24,
  overdue_repeat_enabled boolean not null default true, daily_remind_time text not null default '09:00',
  email_notifications_enabled boolean not null default false, notification_email text,
  smtp_host text, smtp_port integer, smtp_user text, smtp_pass_encrypted text, smtp_from_email text, smtp_from_name text,
  otp_secret_encrypted text, otp_configured_at timestamptz,
  reminder_email_enabled boolean not null default true, reminder_email_interval integer not null default 1800,
  notify_start_hour integer not null default 9, notify_end_hour integer not null default 22,
  r2_endpoint text, r2_access_key text, r2_secret_key text, r2_bucket text, r2_public_url text,
  r2_cache_control text not null default 'public, max-age=86400',
  telegram_bot_enabled boolean not null default false, telegram_bot_token_encrypted text,
  telegram_bot_chat_id text, telegram_bot_name text, telegram_bot_username text,
  telegram_bot_last_test_at timestamptz, telegram_bot_last_test_status text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Incremental AI voice-assistant configuration. Added after the original columns so
-- fresh installs and upgraded production databases keep the same ordinal schema.
alter table public.app_settings add column if not exists voice_assistant_provider text not null default 'openai-compatible';
alter table public.app_settings add column if not exists voice_assistant_base_url text not null default 'https://api.openai.com/v1';
alter table public.app_settings add column if not exists voice_assistant_api_key_encrypted text;
alter table public.app_settings add column if not exists voice_assistant_model text not null default 'gpt-4o-mini';
alter table public.app_settings add column if not exists voice_assistant_system_prompt text not null default '你是提醒事项语音助手。需要时使用工具，并简洁地用中文回复。';
alter table public.app_settings add column if not exists voice_assistant_allow_mutations boolean not null default false;
alter table public.app_settings add column if not exists voice_assistant_default_voice text not null default 'zh-CN-XiaoxiaoNeural';
alter table public.app_settings add column if not exists voice_assistant_configured boolean not null default false;

comment on column public.app_settings.voice_assistant_provider is 'AI voice assistant provider protocol';
comment on column public.app_settings.voice_assistant_base_url is 'HTTPS base URL for the configured AI provider';
comment on column public.app_settings.voice_assistant_api_key_encrypted is 'AES-GCM encrypted provider API key; never returned to clients';
comment on column public.app_settings.voice_assistant_model is 'AI model identifier';
comment on column public.app_settings.voice_assistant_system_prompt is 'System prompt used for voice assistant requests';
comment on column public.app_settings.voice_assistant_allow_mutations is 'Whether confirmed requests may expose non-destructive MCP mutation tools';
comment on column public.app_settings.voice_assistant_default_voice is 'Default Edge TTS voice for assistant replies';
comment on column public.app_settings.voice_assistant_configured is 'Whether database provider values explicitly override environment configuration';

create table if not exists public.app_migrations (
  version text primary key,
  completed_at timestamptz not null default now()
);

-- Fail closed if a pre-existing table is not exactly the schema this runtime expects.
do $validation$
declare
  actual text[];
  expected constant text[] := array[
    'id:integer:NO:1','app_name:text:NO:''到期提醒''::text','timezone:text:NO:''Asia/Shanghai''::text',
    'default_remind_before_days:integer:NO:3','default_remind_before_hours:integer:NO:24',
    'overdue_repeat_enabled:boolean:NO:true','daily_remind_time:text:NO:''09:00''::text',
    'email_notifications_enabled:boolean:NO:false','notification_email:text:YES:',
    'smtp_host:text:YES:','smtp_port:integer:YES:','smtp_user:text:YES:','smtp_pass_encrypted:text:YES:',
    'smtp_from_email:text:YES:','smtp_from_name:text:YES:','otp_secret_encrypted:text:YES:','otp_configured_at:timestamp with time zone:YES:',
    'reminder_email_enabled:boolean:NO:true','reminder_email_interval:integer:NO:1800','notify_start_hour:integer:NO:9','notify_end_hour:integer:NO:22',
    'r2_endpoint:text:YES:','r2_access_key:text:YES:','r2_secret_key:text:YES:','r2_bucket:text:YES:','r2_public_url:text:YES:',
    'r2_cache_control:text:NO:''public, max-age=86400''::text','telegram_bot_enabled:boolean:NO:false',
    'telegram_bot_token_encrypted:text:YES:','telegram_bot_chat_id:text:YES:','telegram_bot_name:text:YES:','telegram_bot_username:text:YES:',
    'telegram_bot_last_test_at:timestamp with time zone:YES:','telegram_bot_last_test_status:text:YES:',
    'created_at:timestamp with time zone:NO:now()','updated_at:timestamp with time zone:NO:now()',
    'voice_assistant_provider:text:NO:''openai-compatible''::text',
    'voice_assistant_base_url:text:NO:''https://api.openai.com/v1''::text','voice_assistant_api_key_encrypted:text:YES:',
    'voice_assistant_model:text:NO:''gpt-4o-mini''::text',
    'voice_assistant_system_prompt:text:NO:''你是提醒事项语音助手。需要时使用工具，并简洁地用中文回复。''::text',
    'voice_assistant_allow_mutations:boolean:NO:false','voice_assistant_default_voice:text:NO:''zh-CN-XiaoxiaoNeural''::text',
    'voice_assistant_configured:boolean:NO:false'
  ];
begin
  select array_agg(column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') order by ordinal_position)
    into actual from information_schema.columns where table_schema='public' and table_name='app_settings';
  if actual is distinct from expected then raise exception 'app_settings schema differs from expected columns/types/nullability/defaults'; end if;
  if not exists (
    select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='app_settings' and c.contype='p'
      and pg_get_constraintdef(c.oid)='PRIMARY KEY (id)'
  ) or not exists (
    select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='app_settings' and c.contype='c'
      and regexp_replace(pg_get_constraintdef(c.oid),'[()]','','g') like 'CHECK id = 1'
  ) then raise exception 'app_settings singleton constraints differ from expected'; end if;

  select array_agg(column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') order by ordinal_position)
    into actual from information_schema.columns where table_schema='public' and table_name='app_migrations';
  if actual is distinct from array['version:text:NO:','completed_at:timestamp with time zone:NO:now()'] then
    raise exception 'app_migrations schema differs from expected columns/types/nullability/defaults';
  end if;
  if (select count(*) from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='public' and t.relname='app_migrations' and c.contype='p'
        and pg_get_constraintdef(c.oid)='PRIMARY KEY (version)') <> 1 then
    raise exception 'app_migrations primary key differs from expected';
  end if;
end $validation$;

-- Remove every inherited/default exposure and every unexpected policy, then establish service-only access.
alter table public.app_settings enable row level security;
alter table public.app_settings force row level security;
alter table public.app_migrations enable row level security;
alter table public.app_migrations force row level security;
do $revoke$
declare g record;
begin
  -- Revoke every explicit non-owner ACL entry, including PUBLIC and custom roles.
  -- Owners retain unavoidable implicit privileges and are excluded from exact ACL checks.
  for g in
    select distinct c.relname, x.grantee, case when x.grantee=0 then 'PUBLIC' else r.rolname end as grantee_name
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(c.relacl) x left join pg_roles r on r.oid=x.grantee
    where n.nspname='public' and c.relname in ('app_settings','app_migrations')
      and x.grantee<>c.relowner and coalesce(r.rolname,'PUBLIC')<>'service_role'
  loop
    if g.grantee=0 then execute format('revoke all privileges on table public.%I from PUBLIC',g.relname);
    else execute format('revoke all privileges on table public.%I from %I',g.relname,g.grantee_name); end if;
  end loop;
end $revoke$;
revoke all on table public.app_settings, public.app_migrations from service_role;
grant select, insert, update, delete on table public.app_settings to service_role;
grant select on table public.app_migrations to service_role;
do $policies$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_policies
    where schemaname='public' and tablename in ('app_settings','app_migrations')
  loop execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename); end loop;
end $policies$;

do $acl_validation$
declare actual text[];
begin
  select coalesce(array_agg(coalesce(r.rolname,'PUBLIC')||':'||c.relname||':'||x.privilege_type order by r.rolname,c.relname,x.privilege_type),array[]::text[])
    into actual from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r',c.relowner))) x left join pg_roles r on r.oid=x.grantee
    where n.nspname='public' and c.relname in ('app_settings','app_migrations') and x.grantee<>c.relowner;
  if actual is distinct from array[
    'service_role:app_migrations:SELECT','service_role:app_settings:DELETE','service_role:app_settings:INSERT',
    'service_role:app_settings:SELECT','service_role:app_settings:UPDATE'
  ] then raise exception 'unexpected explicit table privileges remain on app settings migration tables'; end if;
end $acl_validation$;

-- Held until COMMIT; target classification, writes, verification and marker creation follow this statement.
lock table public.app_settings in access exclusive mode;
