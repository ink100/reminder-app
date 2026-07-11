create table if not exists public.todos (
  id text primary key,
  title text not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.images (
  id text primary key,
  filename text not null,
  original_name text not null,
  mimetype text not null,
  size integer not null,
  r2_key text not null,
  url text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.task_run_logs (
  id text primary key,
  task text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  success boolean not null,
  summary text,
  created_at timestamptz not null default now()
);
create index if not exists todos_completed_at_idx on public.todos(completed_at);
create index if not exists todos_deleted_at_idx on public.todos(deleted_at);
create index if not exists todos_created_at_idx on public.todos(created_at);
create index if not exists images_created_at_idx on public.images(created_at);
create index if not exists images_deleted_at_idx on public.images(deleted_at);
create index if not exists task_run_logs_started_at_idx on public.task_run_logs(started_at);
comment on table public.todos is 'Server-only todo records migrated from rollback-preserved SQLite';
comment on column public.todos.id is 'Stable application-generated text identifier';
comment on column public.todos.title is 'Todo title';
comment on column public.todos.completed_at is 'Completion instant or null';
comment on column public.todos.created_at is 'Creation instant';
comment on column public.todos.updated_at is 'Last update instant';
comment on column public.todos.deleted_at is 'Soft deletion instant or null';
comment on table public.images is 'Server-only Cloudflare R2 object metadata';
comment on column public.images.id is 'Stable application-generated text identifier';
comment on column public.images.filename is 'Application-generated stored filename';
comment on column public.images.original_name is 'Original uploaded filename';
comment on column public.images.mimetype is 'Uploaded media type';
comment on column public.images.size is 'Object size in bytes';
comment on column public.images.r2_key is 'Sensitive Cloudflare R2 object key';
comment on column public.images.url is 'Object URL';
comment on column public.images.created_at is 'Creation instant';
comment on column public.images.deleted_at is 'Soft deletion instant or null';
comment on table public.task_run_logs is 'Server-only scheduler execution metadata; retained without pruning';
comment on column public.task_run_logs.id is 'Stable application-generated text identifier';
comment on column public.task_run_logs.task is 'Task identifier';
comment on column public.task_run_logs.started_at is 'Execution start instant';
comment on column public.task_run_logs.finished_at is 'Execution finish instant or null';
comment on column public.task_run_logs.success is 'Whether execution succeeded';
comment on column public.task_run_logs.summary is 'Sensitive execution result summary or null';
comment on column public.task_run_logs.created_at is 'Record creation instant';
alter table public.todos enable row level security;
alter table public.images enable row level security;
alter table public.task_run_logs enable row level security;
revoke all on public.todos, public.images, public.task_run_logs from anon, authenticated;
grant select, insert, update, delete on public.todos, public.images, public.task_run_logs to service_role;
