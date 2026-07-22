-- =====================================================
-- CloudEarn migration — 2026-06-24 (c)
-- Tam, tek seferlik düzeltme. Idempotent — defalarca çalıştırılabilir.
-- Çalıştır: Supabase SQL Editor → New query → bu dosyayı yapıştır → Run.
-- =====================================================

-- ---------- task_starts (görev "Aç → Doğrula" akışı için) ----------
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
drop policy if exists "ts self read"   on public.task_starts;
drop policy if exists "ts self upsert" on public.task_starts;
drop policy if exists "ts self update" on public.task_starts;
create policy "ts self read"   on public.task_starts for select to authenticated
  using (user_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));
create policy "ts self upsert" on public.task_starts for insert to authenticated
  with check (user_tg_id = public.current_tg_id());
create policy "ts self update" on public.task_starts for update to authenticated
  using (user_tg_id = public.current_tg_id());

-- ---------- xox_sessions (XOX kaldığı yerden devam) ----------
create table if not exists public.xox_sessions (
  user_tg_id bigint primary key references public.users(tg_id) on delete cascade,
  board      jsonb  not null,
  turn       text   not null default 'X',
  result     text,
  claimed    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.xox_sessions to authenticated;
grant all on public.xox_sessions to service_role;
alter table public.xox_sessions enable row level security;
drop policy if exists "xox self read"   on public.xox_sessions;
drop policy if exists "xox self upsert" on public.xox_sessions;
drop policy if exists "xox self update" on public.xox_sessions;
create policy "xox self read"   on public.xox_sessions for select to authenticated
  using (user_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));
create policy "xox self upsert" on public.xox_sessions for insert to authenticated
  with check (user_tg_id = public.current_tg_id());
create policy "xox self update" on public.xox_sessions for update to authenticated
  using (user_tg_id = public.current_tg_id());

-- ---------- ad_views: onclicka network ----------
do $$ begin
  alter table public.ad_views drop constraint if exists ad_views_network_check;
exception when others then null; end $$;
alter table public.ad_views
  add constraint ad_views_network_check
  check (network in ('adsgram','monetag','richads','onclicka'));

-- ---------- withdrawals: queued/processing/failed/approved durumlar ----------
alter table public.withdrawals add column if not exists batch_id   uuid;
alter table public.withdrawals add column if not exists queued_at  timestamptz;
alter table public.withdrawals add column if not exists tx_id      text;
alter table public.withdrawals add column if not exists processed_at timestamptz;
alter table public.withdrawals add column if not exists processed_by bigint;
do $$ begin
  alter table public.withdrawals drop constraint if exists withdrawals_status_check;
exception when others then null; end $$;
alter table public.withdrawals
  add constraint withdrawals_status_check
  check (status in ('pending','queued','processing','approved','paid','failed','rejected'));
create index if not exists idx_wd_batch on public.withdrawals(batch_id);
create index if not exists idx_wd_status on public.withdrawals(status);

-- ---------- TON payout queue RPC ----------
create or replace function public.ton_lock_next_payout()
returns setof public.withdrawals language plpgsql security definer set search_path = public as $$
declare picked_id uuid;
begin
  select id into picked_id
    from public.withdrawals
   where method = 'ton' and status = 'queued'
   order by queued_at asc nulls last
   for update skip locked
   limit 1;
  if picked_id is null then return; end if;
  update public.withdrawals set status = 'processing' where id = picked_id;
  return query select * from public.withdrawals where id = picked_id;
end $$;
grant execute on function public.ton_lock_next_payout() to service_role;

-- ---------- promo_redemptions (Promo Kod kontrolü için) ----------
create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references public.promo_codes(id) on delete cascade,
  user_tg_id bigint not null references public.users(tg_id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (promo_id, user_tg_id)
);
grant select, insert on public.promo_redemptions to authenticated;
grant all on public.promo_redemptions to service_role;
alter table public.promo_redemptions enable row level security;
drop policy if exists "pr self read"   on public.promo_redemptions;
create policy "pr self read" on public.promo_redemptions for select to authenticated
  using (user_tg_id = public.current_tg_id());

-- ---------- app_config: OnClickA reward ----------
insert into public.app_config(key, value) values
  ('reward_onclicka', '25'::jsonb)
on conflict (key) do update set value = excluded.value;

-- DONE.