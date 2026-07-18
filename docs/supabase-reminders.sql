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
alter table public.attachments add column if not exists medicine_id text;
alter table public.attachments add column if not exists license_store_account_id text;

create table if not exists public.medicines (
  id text primary key,
  name text not null,
  category text not null default '其他',
  tags text,
  quantity_total numeric,
  quantity_remaining numeric,
  unit text not null default '盒',
  low_stock_threshold numeric,
  location_text text,
  content_text text,
  opened_at timestamptz,
  expires_at timestamptz,
  expiration_reminder_days integer not null default 30,
  expiration_reminder_id text references public.reminders(id) on delete set null on update cascade,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.attachments drop constraint if exists attachments_medicine_id_fkey;
alter table public.attachments add constraint attachments_medicine_id_fkey foreign key (medicine_id) references public.medicines(id) on delete set null on update cascade;

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
alter table public.attachments drop constraint if exists attachments_license_store_account_id_fkey;
alter table public.attachments add constraint attachments_license_store_account_id_fkey foreign key (license_store_account_id) references public.license_store_accounts(id) on delete set null on update cascade;
create index if not exists reminders_due_at_idx on public.reminders(due_at);
create index if not exists reminders_completed_at_idx on public.reminders(completed_at);
create index if not exists reminders_deleted_at_idx on public.reminders(deleted_at);
create index if not exists attachments_reminder_id_idx on public.attachments(reminder_id);
create index if not exists attachments_medicine_id_idx on public.attachments(medicine_id);
create index if not exists attachments_created_at_idx on public.attachments(created_at);
create index if not exists attachments_deleted_at_idx on public.attachments(deleted_at);
create index if not exists attachments_attachment_type_idx on public.attachments(attachment_type);
create index if not exists attachments_license_store_account_id_idx on public.attachments(license_store_account_id);
update public.attachments
set deleted_at = coalesce(deleted_at, now())
where attachment_type in ('wechat_payment_qr', 'alipay_payment_qr')
  and license_store_account_id is null
  and deleted_at is null;
alter table public.attachments drop constraint if exists attachments_payment_qr_requires_store_account;
alter table public.attachments add constraint attachments_payment_qr_requires_store_account check (
  attachment_type not in ('wechat_payment_qr', 'alipay_payment_qr') or license_store_account_id is not null
);
create unique index if not exists attachments_active_store_account_payment_qr_uidx
  on public.attachments(license_store_account_id, attachment_type)
  where deleted_at is null
    and license_store_account_id is not null
    and attachment_type in ('wechat_payment_qr', 'alipay_payment_qr');
create index if not exists medicines_category_idx on public.medicines(category);
create index if not exists medicines_expires_at_idx on public.medicines(expires_at);
create index if not exists medicines_deleted_at_idx on public.medicines(deleted_at);
create index if not exists medicines_expiration_reminder_id_idx on public.medicines(expiration_reminder_id);
create index if not exists license_store_accounts_expires_at_idx on public.license_store_accounts(expires_at);
create index if not exists license_store_accounts_activation_code_idx on public.license_store_accounts(activation_code);
create index if not exists license_store_accounts_reminder_id_idx on public.license_store_accounts(reminder_id);
create index if not exists license_store_accounts_deleted_at_idx on public.license_store_accounts(deleted_at);

comment on table public.reminders is 'Reminder records migrated from the rollback-preserved SQLite database';
comment on table public.attachments is 'R2 file metadata optionally associated with a reminder, medicine, or license store account';
comment on table public.medicines is 'Single-user household human medicine inventory records';
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
comment on column public.attachments.medicine_id is 'Optional owning medicine record'; comment on column public.attachments.attachment_type is 'Optional business usage, including payment QR images and medicine photo categories';
comment on column public.attachments.license_store_account_id is 'Optional owning license store account for record-specific payment QR screenshots';
comment on column public.attachments.created_at is 'Creation instant'; comment on column public.attachments.deleted_at is 'Soft deletion instant';
comment on column public.medicines.id is 'Stable application-generated text identifier'; comment on column public.medicines.name is 'Medicine name for human-use household inventory';
comment on column public.medicines.category is 'Medicine category label'; comment on column public.medicines.tags is 'Free-form comma-separated search tags';
comment on column public.medicines.quantity_total is 'Original or total quantity'; comment on column public.medicines.quantity_remaining is 'Current remaining quantity';
comment on column public.medicines.unit is 'Quantity unit'; comment on column public.medicines.low_stock_threshold is 'Optional low-stock threshold';
comment on column public.medicines.location_text is 'Text storage location'; comment on column public.medicines.content_text is 'Text usage/instruction content';
comment on column public.medicines.opened_at is 'Opening date/time'; comment on column public.medicines.expires_at is 'Expiration date/time';
comment on column public.medicines.expiration_reminder_days is 'Days before expiration to create/update the linked reminder';
comment on column public.medicines.expiration_reminder_id is 'Optional linked reminder generated for medicine expiration'; comment on column public.medicines.notes is 'Owner notes';
comment on column public.medicines.created_at is 'Creation instant'; comment on column public.medicines.updated_at is 'Last update instant'; comment on column public.medicines.deleted_at is 'Soft deletion instant';
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
drop function if exists public.soft_delete_license_store_account_with_attachments(text,timestamptz);
create function public.soft_delete_license_store_account_with_attachments(p_account_id text, p_deleted_at timestamptz)
returns text[] language plpgsql security definer set search_path = public as $$
declare object_keys text[];
begin
  perform 1 from public.license_store_accounts where id = p_account_id and deleted_at is null for update;
  if not found then raise exception 'license store account not found or already deleted' using errcode = 'P0002'; end if;
  select coalesce(array_agg(r2_key), array[]::text[]) into object_keys
    from public.attachments where license_store_account_id = p_account_id and deleted_at is null;
  update public.attachments set deleted_at = p_deleted_at where license_store_account_id = p_account_id and deleted_at is null;
  update public.license_store_accounts set deleted_at = p_deleted_at, updated_at = p_deleted_at where id = p_account_id;
  return object_keys;
end $$;
revoke all on function public.soft_delete_license_store_account_with_attachments(text,timestamptz) from public, anon, authenticated;
grant execute on function public.soft_delete_license_store_account_with_attachments(text,timestamptz) to service_role;

drop function if exists public.replace_license_store_account_payment_qr(text,text,text,text,text,text,integer,text,text,timestamptz);
create function public.replace_license_store_account_payment_qr(
  p_account_id text, p_attachment_type text, p_new_id text, p_filename text, p_original_name text,
  p_mimetype text, p_size integer, p_r2_key text, p_url text, p_created_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare old_r2_key text;
begin
  if p_attachment_type not in ('wechat_payment_qr', 'alipay_payment_qr') then
    raise exception 'unsupported payment QR type' using errcode = '22023';
  end if;
  perform 1 from public.license_store_accounts where id = p_account_id and deleted_at is null for update;
  if not found then raise exception 'license store account not found or already deleted' using errcode = 'P0002'; end if;
  select r2_key into old_r2_key from public.attachments
    where license_store_account_id = p_account_id and attachment_type = p_attachment_type and deleted_at is null
    order by created_at desc limit 1 for update;
  update public.attachments set deleted_at = p_created_at
    where license_store_account_id = p_account_id and attachment_type = p_attachment_type and deleted_at is null;
  insert into public.attachments(id, filename, original_name, mimetype, size, r2_key, url, reminder_id, attachment_type, medicine_id, license_store_account_id, created_at, deleted_at)
  values(p_new_id, p_filename, p_original_name, p_mimetype, p_size, p_r2_key, p_url, null, p_attachment_type, null, p_account_id, p_created_at, null);
  return jsonb_build_object(
    'oldR2Key', old_r2_key,
    'item', jsonb_build_object(
      'id', p_new_id,
      'originalName', p_original_name,
      'mimetype', p_mimetype,
      'size', p_size,
      'url', p_url,
      'attachmentType', p_attachment_type,
      'licenseStoreAccountId', p_account_id,
      'createdAt', p_created_at
    )
  );
end $$;
revoke all on function public.replace_license_store_account_payment_qr(text,text,text,text,text,text,integer,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.replace_license_store_account_payment_qr(text,text,text,text,text,text,integer,text,text,timestamptz) to service_role;

create or replace function public.clear_license_store_account_payment_qr(p_account_id text, p_attachment_type text, p_deleted_at timestamptz)
returns text language plpgsql security definer set search_path = public as $$
declare old_r2_key text;
begin
  if p_attachment_type not in ('wechat_payment_qr', 'alipay_payment_qr') then
    raise exception 'unsupported payment QR type' using errcode = '22023';
  end if;
  perform 1 from public.license_store_accounts where id = p_account_id and deleted_at is null for update;
  if not found then raise exception 'license store account not found or already deleted' using errcode = 'P0002'; end if;
  select r2_key into old_r2_key from public.attachments
    where license_store_account_id = p_account_id and attachment_type = p_attachment_type and deleted_at is null
    order by created_at desc limit 1 for update;
  update public.attachments set deleted_at = p_deleted_at
    where license_store_account_id = p_account_id and attachment_type = p_attachment_type and deleted_at is null;
  return old_r2_key;
end $$;
revoke all on function public.clear_license_store_account_payment_qr(text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.clear_license_store_account_payment_qr(text,text,timestamptz) to service_role;
alter table public.reminders enable row level security; alter table public.attachments enable row level security; alter table public.medicines enable row level security; alter table public.license_store_accounts enable row level security;
revoke all on public.reminders, public.attachments, public.medicines, public.license_store_accounts from anon, authenticated;
grant select, insert, update, delete on public.reminders, public.attachments, public.medicines, public.license_store_accounts to service_role;

