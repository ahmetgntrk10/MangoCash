-- =====================================================
-- CloudEarn migration — 2026-06-24 (b)
-- Adds: OnClickA ad network, two-stage task verify, XOX persistent sessions.
-- Idempotent; safe to re-run.
-- =====================================================

-- ----- ad_views: allow new 'onclicka' network -----
do $$
begin
  alter table public.ad_views drop constraint if exists ad_views_network_check;
exception when others then null;
end $$;
alter table public.ad_views
  add constraint ad_views_network_check
  check (network in ('adsgram','monetag','richads','onclicka'));

-- ----- app_config: OnClickA reward + tunables -----
insert into public.app_config(key, value) values
  ('reward_onclicka', '25'::jsonb)
on conflict (key) do update set value = excluded.value;

-- ----- task_starts: track open time for timer/channel verification -----
create table if not exists public.task_starts (
  user_tg_id bigint not null references public.users(tg_id) on delete cascade,
  task_id    uuid   not null references public.tasks(id)    on delete cascade,
  started_at timestamptz not null default now(),
  primary key (user_tg_id, task_id)
);
create index if not exists idx_task_starts_task on public.task_starts(task_id);

grant select, insert, update on public.task_starts to authenticated;
grant all on public.task_starts to service_role;

alter table public.task_starts enable row level security;
drop policy if exists "ts self read" on public.task_starts;
create policy "ts self read" on public.task_starts for select to authenticated
  using (user_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));
drop policy if exists "ts self upsert" on public.task_starts;
create policy "ts self upsert" on public.task_starts for insert to authenticated
  with check (user_tg_id = public.current_tg_id());
drop policy if exists "ts self update" on public.task_starts;
create policy "ts self update" on public.task_starts for update to authenticated
  using (user_tg_id = public.current_tg_id());

-- ----- xox_sessions: server-side persistent XOX state -----
create table if not exists public.xox_sessions (
  user_tg_id bigint primary key references public.users(tg_id) on delete cascade,
  board      jsonb  not null,
  turn       text   not null default 'X',
  result     text,
  claimed    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_xox_open on public.xox_sessions(user_tg_id) where claimed = false;

grant select, insert, update on public.xox_sessions to authenticated;
grant all on public.xox_sessions to service_role;

alter table public.xox_sessions enable row level security;
drop policy if exists "xox self read" on public.xox_sessions;
create policy "xox self read" on public.xox_sessions for select to authenticated
  using (user_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));
drop policy if exists "xox self upsert" on public.xox_sessions;
create policy "xox self upsert" on public.xox_sessions for insert to authenticated
  with check (user_tg_id = public.current_tg_id());
drop policy if exists "xox self update" on public.xox_sessions;
create policy "xox self update" on public.xox_sessions for update to authenticated
  using (user_tg_id = public.current_tg_id());

-- DONE.