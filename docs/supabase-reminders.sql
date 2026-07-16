create table if not exists public.reminders (
  id text primary key,
  title text not null,
  description text,
  activation_code text,
  activation_contact text,
  due_at timestamptz not null,
  priority text not null default 'medium',
  category text,
  remind_before_days integer not null default 3,
  remind_before_hours integer not null default 24,
  overdue_remind_enabled boolean not null default true,
  recurrence_type text,
  recurrence_interval integer,
  upcoming_notified_at timestamptz,
  overdue_notified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.attachments (
  id text primary key,
  filename text not null,
  original_name text not null,
  mimetype text not null,
  size integer not null,
  r2_key text not null,
  url text not null,
  reminder_id text references public.reminders(id) on delete set null on update cascade,
  attachment_type text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.attachments add column if not exists attachment_type text;

-- Normalize legacy free-form categories into the reminder groups used by the UI.
update public.reminders set category = case
  when category in ('激活码', '授权', '店铺') then '授权与店铺'
  when category in ('SSL证书', '证书', '域名', '服务器') then '服务器与证书'
  when category in ('账单', '续费') then '账单与续费'
  when category = '宠物' then '宠物健康'
  when category = '生活' then '日常生活'
  when category in ('工作', '项目') then '工作与项目'
  when category is null or btrim(category) = '' then '其他'
  else category
end
where category is null
   or btrim(category) = ''
   or category in ('激活码', '授权', '店铺', 'SSL证书', '证书', '域名', '服务器', '账单', '续费', '宠物', '生活', '工作', '项目');
create table if not exists public.license_store_accounts (
  id text primary key,
  shop_name text not null,
  phone text not null,
  remote_code text not null,
  remote_password text not null,
  is_other_account boolean not null default false,
  expires_at timestamptz not null,
  activation_code text not null,
  reminder_id text references public.reminders(id) on delete set null on update cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists reminders_due_at_idx on public.reminders(due_at);
create index if not exists reminders_completed_at_idx on public.reminders(completed_at);
create index if not exists reminders_deleted_at_idx on public.reminders(deleted_at);
create index if not exists attachments_reminder_id_idx on public.attachments(reminder_id);
create index if not exists attachments_created_at_idx on public.attachments(created_at);
create index if not exists attachments_deleted_at_idx on public.attachments(deleted_at);
create index if not exists attachments_attachment_type_idx on public.attachments(attachment_type);
create index if not exists license_store_accounts_expires_at_idx on public.license_store_accounts(expires_at);
create index if not exists license_store_accounts_activation_code_idx on public.license_store_accounts(activation_code);
create index if not exists license_store_accounts_reminder_id_idx on public.license_store_accounts(reminder_id);
create index if not exists license_store_accounts_deleted_at_idx on public.license_store_accounts(deleted_at);

comment on table public.reminders is 'Reminder records migrated from the rollback-preserved SQLite database';
comment on table public.attachments is 'R2 file metadata optionally associated with a reminder';
comment on table public.license_store_accounts is 'License store account and expiration records';
comment on column public.reminders.id is 'Stable application-generated text identifier';
comment on column public.reminders.title is 'Reminder title'; comment on column public.reminders.description is 'Optional description';
comment on column public.reminders.activation_code is 'Optional activation code'; comment on column public.reminders.activation_contact is 'Optional activation contact';
comment on column public.reminders.due_at is 'Due instant'; comment on column public.reminders.priority is 'Priority label'; comment on column public.reminders.category is 'Optional category';
comment on column public.reminders.remind_before_days is 'Upcoming notification lead in days'; comment on column public.reminders.remind_before_hours is 'Upcoming notification lead in hours';
comment on column public.reminders.overdue_remind_enabled is 'Whether overdue notifications are enabled'; comment on column public.reminders.recurrence_type is 'Optional recurrence unit';
comment on column public.reminders.recurrence_interval is 'Optional recurrence interval'; comment on column public.reminders.upcoming_notified_at is 'Last upcoming notification instant';
comment on column public.reminders.overdue_notified_at is 'Last overdue notification instant'; comment on column public.reminders.completed_at is 'Completion instant';
comment on column public.reminders.created_at is 'Creation instant'; comment on column public.reminders.updated_at is 'Last update instant'; comment on column public.reminders.deleted_at is 'Soft deletion instant';
comment on column public.attachments.id is 'Stable application-generated text identifier'; comment on column public.attachments.filename is 'Stored filename';
comment on column public.attachments.original_name is 'Original uploaded filename'; comment on column public.attachments.mimetype is 'Media type'; comment on column public.attachments.size is 'Size in bytes';
comment on column public.attachments.r2_key is 'Cloudflare R2 object key'; comment on column public.attachments.url is 'Public object URL'; comment on column public.attachments.reminder_id is 'Optional owning reminder';
comment on column public.attachments.attachment_type is 'Optional business usage, including WeChat or Alipay payment QR images';
comment on column public.attachments.created_at is 'Creation instant'; comment on column public.attachments.deleted_at is 'Soft deletion instant';
comment on column public.license_store_accounts.id is 'Stable application-generated text identifier'; comment on column public.license_store_accounts.shop_name is 'Shop name';
comment on column public.license_store_accounts.phone is 'Contact phone'; comment on column public.license_store_accounts.remote_code is 'Remote support code';
comment on column public.license_store_accounts.remote_password is 'Remote support password'; comment on column public.license_store_accounts.is_other_account is 'Whether this is another account';
comment on column public.license_store_accounts.expires_at is 'License expiration instant'; comment on column public.license_store_accounts.activation_code is 'License activation code';
comment on column public.license_store_accounts.reminder_id is 'Optional linked reminder, including soft-deleted reminders'; comment on column public.license_store_accounts.created_at is 'Creation instant';
comment on column public.license_store_accounts.updated_at is 'Last update instant'; comment on column public.license_store_accounts.deleted_at is 'Soft deletion instant';

create or replace function public.soft_delete_reminder_with_attachments(p_reminder_id text, p_deleted_at timestamptz)
returns integer language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  update public.attachments set deleted_at = p_deleted_at where reminder_id = p_reminder_id and deleted_at is null;
  get diagnostics affected = row_count;
  update public.reminders set deleted_at = p_deleted_at, updated_at = p_deleted_at where id = p_reminder_id and deleted_at is null;
  if not found then raise exception 'reminder not found or already deleted' using errcode = 'P0002'; end if;
  return affected;
end $$;
revoke all on function public.soft_delete_reminder_with_attachments(text,timestamptz) from public, anon, authenticated;
grant execute on function public.soft_delete_reminder_with_attachments(text,timestamptz) to service_role;
alter table public.reminders enable row level security; alter table public.attachments enable row level security; alter table public.license_store_accounts enable row level security;
revoke all on public.reminders, public.attachments, public.license_store_accounts from anon, authenticated;
grant select, insert, update, delete on public.reminders, public.attachments, public.license_store_accounts to service_role;

