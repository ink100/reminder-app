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

create table if not exists public.license_store_accounts (
  id text primary key,
  shop_name text not null,
  phone text not null,
  remote_code text not null,
  remote_password text not null,
  is_other_account boolean not null default false,
  expires_at timestamptz,
  activation_code text not null,
  reminder_id text references public.reminders(id) on delete set null on update cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Legacy import compatibility. These are restored after all historical rows are loaded.
drop trigger if exists reminders_normalize_license_store_schedule on public.reminders;
drop trigger if exists reminders_sync_license_store_expiry on public.reminders;
drop index if exists license_store_accounts_reminder_id_unique;
alter table public.license_store_accounts drop constraint if exists license_store_accounts_reminder_id_fkey;
alter table public.license_store_accounts alter column expires_at drop not null;
alter table public.license_store_accounts alter column reminder_id drop not null;

-- POST-IMPORT: ownership repair, verification, constraints, triggers, and RPCs.

-- Normalize imported legacy free-form categories into the reminder groups used by the UI.
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

create or replace function public.utc_clamped_calendar_year_later(p_at timestamptz)
returns timestamptz language sql immutable strict set search_path = public as $$
  with utc as (
    select p_at at time zone 'UTC' as value
  ), parts as (
    select
      extract(year from value)::integer + 1 as target_year,
      extract(month from value)::integer as target_month,
      extract(day from value)::integer as target_day,
      value::time as time_of_day
    from utc
  )
  select (
    make_date(
      target_year,
      target_month,
      least(
        target_day,
        extract(day from (make_date(target_year, target_month, 1) + interval '1 month - 1 day'))::integer
      )
    ) + time_of_day
  ) at time zone 'UTC'
  from parts
$$;

-- Every store account owns exactly one reminder. Repair and synchronize legacy records first.
-- Existing store expiry wins; otherwise keep a linked reminder time; otherwise use the synchronization time.
-- Due times no later than one calendar year from synchronization recur yearly; later times are one-off.
do $$
declare
  account_row record;
  owned_reminder_id text;
  reminder_due_at timestamptz;
  sync_at timestamptz := transaction_timestamp();
  is_yearly boolean;
begin
  for account_row in
    select * from public.license_store_accounts order by created_at, id
  loop
    owned_reminder_id := account_row.reminder_id;
    reminder_due_at := account_row.expires_at;
    if reminder_due_at is null and owned_reminder_id is not null then
      select due_at into reminder_due_at
      from public.reminders
      where id = owned_reminder_id;
    end if;
    reminder_due_at := coalesce(reminder_due_at, sync_at);
    is_yearly := reminder_due_at <= public.utc_clamped_calendar_year_later(sync_at);

    if owned_reminder_id is null
       or not exists (select 1 from public.reminders where id = owned_reminder_id)
       or exists (
         select 1 from public.license_store_accounts earlier
         where earlier.reminder_id = owned_reminder_id
           and (earlier.created_at, earlier.id) < (account_row.created_at, account_row.id)
       ) then
      owned_reminder_id := 'lsr_' || md5(account_row.id);
      insert into public.reminders (
        id, title, description, activation_code, due_at, priority, category,
        remind_before_days, remind_before_hours, overdue_remind_enabled,
        recurrence_type, recurrence_interval, deleted_at
      ) values (
        owned_reminder_id,
        btrim(account_row.shop_name) || '激活码到期',
        '店铺：' || btrim(account_row.shop_name) || E'\n手机号：' || btrim(account_row.phone),
        btrim(account_row.activation_code), reminder_due_at, 'medium', '授权与店铺',
        3, 24, true,
        case when is_yearly then 'yearly' else null end,
        case when is_yearly then 1 else null end,
        account_row.deleted_at
      ) on conflict (id) do update set
        title = excluded.title,
        description = excluded.description,
        activation_code = excluded.activation_code,
        due_at = excluded.due_at,
        priority = excluded.priority,
        category = excluded.category,
        remind_before_days = excluded.remind_before_days,
        remind_before_hours = excluded.remind_before_hours,
        overdue_remind_enabled = excluded.overdue_remind_enabled,
        recurrence_type = excluded.recurrence_type,
        recurrence_interval = excluded.recurrence_interval,
        completed_at = null,
        upcoming_notified_at = null,
        overdue_notified_at = null,
        deleted_at = excluded.deleted_at,
        updated_at = sync_at;
    else
      update public.reminders set
        title = btrim(account_row.shop_name) || '激活码到期',
        description = '店铺：' || btrim(account_row.shop_name) || E'\n手机号：' || btrim(account_row.phone),
        activation_code = btrim(account_row.activation_code),
        due_at = reminder_due_at,
        priority = 'medium',
        category = '授权与店铺',
        remind_before_days = 3,
        remind_before_hours = 24,
        overdue_remind_enabled = true,
        recurrence_type = case when is_yearly then 'yearly' else null end,
        recurrence_interval = case when is_yearly then 1 else null end,
        completed_at = null,
        upcoming_notified_at = null,
        overdue_notified_at = null,
        deleted_at = account_row.deleted_at,
        updated_at = sync_at
      where id = owned_reminder_id;
    end if;

    update public.license_store_accounts
    set reminder_id = owned_reminder_id,
        expires_at = reminder_due_at,
        updated_at = sync_at
    where id = account_row.id;
  end loop;

  -- Remove active leftovers from an interrupted or older generated-ID synchronization.
  update public.reminders reminder
  set deleted_at = sync_at, updated_at = sync_at
  where reminder.id like 'lsr\_%' escape '\'
    and reminder.deleted_at is null
    and not exists (
      select 1 from public.license_store_accounts account where account.reminder_id = reminder.id
    );
end $$;

do $$
begin
  if exists (
    select 1
    from public.license_store_accounts account
    left join public.reminders reminder on reminder.id = account.reminder_id
    where account.reminder_id is null or reminder.id is null
  ) then
    raise exception 'license store reminder synchronization left a missing reminder';
  end if;
  if exists (
    select reminder_id
    from public.license_store_accounts
    group by reminder_id
    having count(*) > 1
  ) then
    raise exception 'license store reminder synchronization left a shared reminder';
  end if;
  if exists (
    select 1
    from public.license_store_accounts account
    join public.reminders reminder on reminder.id = account.reminder_id
    where reminder.due_at is distinct from account.expires_at
       or (account.expires_at <= public.utc_clamped_calendar_year_later(transaction_timestamp())
           and (reminder.recurrence_type is distinct from 'yearly' or reminder.recurrence_interval is distinct from 1))
       or (account.expires_at > public.utc_clamped_calendar_year_later(transaction_timestamp())
           and (reminder.recurrence_type is not null or reminder.recurrence_interval is not null))
  ) then
    raise exception 'license store reminder synchronization left a schedule mismatch';
  end if;
end $$;

alter table public.license_store_accounts drop constraint if exists license_store_accounts_reminder_id_fkey;
alter table public.license_store_accounts alter column expires_at set not null;
alter table public.license_store_accounts alter column reminder_id set not null;
alter table public.license_store_accounts
  add constraint license_store_accounts_reminder_id_fkey
  foreign key (reminder_id) references public.reminders(id) on delete restrict on update cascade;
create unique index if not exists license_store_accounts_reminder_id_unique
  on public.license_store_accounts(reminder_id);

create or replace function public.license_store_account_with_reminder_json(p_account_id text)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', account.id,
    'shopName', account.shop_name,
    'phone', account.phone,
    'remoteCode', account.remote_code,
    'remotePassword', account.remote_password,
    'isOtherAccount', account.is_other_account,
    'expiresAt', account.expires_at,
    'activationCode', account.activation_code,
    'reminderId', account.reminder_id,
    'createdAt', account.created_at,
    'updatedAt', account.updated_at,
    'deletedAt', account.deleted_at,
    'reminder', jsonb_build_object(
      'id', reminder.id,
      'title', reminder.title,
      'dueAt', reminder.due_at,
      'activationCode', reminder.activation_code,
      'deletedAt', reminder.deleted_at
    )
  )
  from public.license_store_accounts account
  join public.reminders reminder on reminder.id = account.reminder_id
  where account.id = p_account_id
$$;
revoke all on function public.license_store_account_with_reminder_json(text) from public, anon, authenticated;

drop function if exists public.create_license_store_account_with_reminder(text,text,text,text,text,text,boolean,timestamptz,text);
create function public.create_license_store_account_with_reminder(
  p_account_id text, p_reminder_id text, p_shop_name text, p_phone text,
  p_remote_code text, p_remote_password text, p_is_other_account boolean,
  p_expires_at timestamptz, p_activation_code text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  sync_at timestamptz := transaction_timestamp();
  is_yearly boolean := p_expires_at <= public.utc_clamped_calendar_year_later(transaction_timestamp());
begin
  insert into public.reminders (
    id, title, description, activation_code, due_at, priority, category,
    remind_before_days, remind_before_hours, overdue_remind_enabled,
    recurrence_type, recurrence_interval, created_at, updated_at
  ) values (
    p_reminder_id, btrim(p_shop_name) || '激活码到期',
    '店铺：' || btrim(p_shop_name) || E'\n手机号：' || btrim(p_phone),
    btrim(p_activation_code), p_expires_at, 'medium', '授权与店铺', 3, 24, true,
    case when is_yearly then 'yearly' else null end,
    case when is_yearly then 1 else null end, sync_at, sync_at
  );
  insert into public.license_store_accounts (
    id, shop_name, phone, remote_code, remote_password, is_other_account,
    expires_at, activation_code, reminder_id, created_at, updated_at
  ) values (
    p_account_id, p_shop_name, p_phone, p_remote_code, p_remote_password, p_is_other_account,
    p_expires_at, p_activation_code, p_reminder_id, sync_at, sync_at
  );
  return public.license_store_account_with_reminder_json(p_account_id);
end $$;
revoke all on function public.create_license_store_account_with_reminder(text,text,text,text,text,text,boolean,timestamptz,text) from public, anon, authenticated;
grant execute on function public.create_license_store_account_with_reminder(text,text,text,text,text,text,boolean,timestamptz,text) to service_role;

drop function if exists public.update_license_store_account_with_reminder(text,text,text,text,text,boolean,timestamptz,text);
create function public.update_license_store_account_with_reminder(
  p_account_id text, p_shop_name text, p_phone text, p_remote_code text,
  p_remote_password text, p_is_other_account boolean, p_expires_at timestamptz,
  p_activation_code text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  owned_reminder_id text;
  sync_at timestamptz := transaction_timestamp();
  is_yearly boolean := p_expires_at <= public.utc_clamped_calendar_year_later(transaction_timestamp());
begin
  select reminder_id into owned_reminder_id
  from public.license_store_accounts
  where id = p_account_id and deleted_at is null
  for update;
  if not found then raise exception 'license store account not found or already deleted' using errcode = 'P0002'; end if;

  update public.license_store_accounts set
    shop_name = p_shop_name, phone = p_phone, remote_code = p_remote_code,
    remote_password = p_remote_password, is_other_account = p_is_other_account,
    expires_at = p_expires_at, activation_code = p_activation_code, updated_at = sync_at
  where id = p_account_id;
  update public.reminders set
    title = btrim(p_shop_name) || '激活码到期',
    description = '店铺：' || btrim(p_shop_name) || E'\n手机号：' || btrim(p_phone),
    activation_code = btrim(p_activation_code), due_at = p_expires_at,
    priority = 'medium', category = '授权与店铺', remind_before_days = 3,
    remind_before_hours = 24, overdue_remind_enabled = true,
    recurrence_type = case when is_yearly then 'yearly' else null end,
    recurrence_interval = case when is_yearly then 1 else null end,
    completed_at = null, upcoming_notified_at = null, overdue_notified_at = null,
    deleted_at = null, updated_at = sync_at
  where id = owned_reminder_id;
  if not found then raise exception 'owned reminder not found' using errcode = 'P0002'; end if;
  return public.license_store_account_with_reminder_json(p_account_id);
end $$;
revoke all on function public.update_license_store_account_with_reminder(text,text,text,text,text,boolean,timestamptz,text) from public, anon, authenticated;
grant execute on function public.update_license_store_account_with_reminder(text,text,text,text,text,boolean,timestamptz,text) to service_role;

create or replace function public.normalize_license_store_reminder_schedule()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from public.license_store_accounts
    where reminder_id = new.id and deleted_at is null
  ) then
    if new.due_at <= public.utc_clamped_calendar_year_later(transaction_timestamp()) then
      new.recurrence_type := 'yearly';
      new.recurrence_interval := 1;
    else
      new.recurrence_type := null;
      new.recurrence_interval := null;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists reminders_normalize_license_store_schedule on public.reminders;
create trigger reminders_normalize_license_store_schedule
before update of due_at, recurrence_type, recurrence_interval on public.reminders
for each row execute function public.normalize_license_store_reminder_schedule();

create or replace function public.sync_license_store_expiry_from_reminder()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.due_at is distinct from old.due_at then
    update public.license_store_accounts
    set expires_at = new.due_at, updated_at = now()
    where reminder_id = new.id and deleted_at is null;
  end if;
  return new;
end $$;
drop trigger if exists reminders_sync_license_store_expiry on public.reminders;
create trigger reminders_sync_license_store_expiry
after update of due_at on public.reminders
for each row execute function public.sync_license_store_expiry_from_reminder();

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
comment on column public.license_store_accounts.reminder_id is 'Required one-to-one reminder owned by this store account; yearly only when due within one year'; comment on column public.license_store_accounts.created_at is 'Creation instant';
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
declare
  object_keys text[];
  owned_reminder_id text;
begin
  select reminder_id into owned_reminder_id
  from public.license_store_accounts
  where id = p_account_id and deleted_at is null
  for update;
  if not found then raise exception 'license store account not found or already deleted' using errcode = 'P0002'; end if;

  select coalesce(array_agg(r2_key), array[]::text[]) into object_keys
  from public.attachments
  where (license_store_account_id = p_account_id or reminder_id = owned_reminder_id)
    and deleted_at is null;

  update public.attachments
  set deleted_at = p_deleted_at
  where (license_store_account_id = p_account_id or reminder_id = owned_reminder_id)
    and deleted_at is null;
  update public.license_store_accounts
  set deleted_at = p_deleted_at, updated_at = p_deleted_at
  where id = p_account_id;
  update public.reminders
  set deleted_at = p_deleted_at, updated_at = p_deleted_at
  where id = owned_reminder_id and deleted_at is null;

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

