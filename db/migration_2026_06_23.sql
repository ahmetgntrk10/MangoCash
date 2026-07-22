-- =====================================================
-- CloudEarn migration — 2026-06-23
-- Idempotent: safe to re-run.
-- Paste this into Supabase SQL Editor → Run.
-- =====================================================

-- ===== users: new columns =====
alter table public.users add column if not exists country_code text;
alter table public.users add column if not exists bio_verified boolean not null default false;

-- ===== withdrawals: fee / queue columns =====
alter table public.withdrawals add column if not exists fee_usdt numeric(18,8) not null default 0;
alter table public.withdrawals add column if not exists amount_net_usdt numeric(18,8);
alter table public.withdrawals add column if not exists batch_id uuid;
alter table public.withdrawals add column if not exists queued_at timestamptz;

-- Allow more statuses than the original enum
do $$
begin
  alter type public.withdraw_status add value if not exists 'queued';
exception when others then null;
end $$;
do $$
begin
  alter type public.withdraw_status add value if not exists 'processing';
exception when others then null;
end $$;
do $$
begin
  alter type public.withdraw_status add value if not exists 'paid';
exception when others then null;
end $$;
do $$
begin
  alter type public.withdraw_status add value if not exists 'failed';
exception when others then null;
end $$;

create index if not exists idx_wd_batch on public.withdrawals(batch_id);

-- ===== ad_views =====
create table if not exists public.ad_views (
  id uuid primary key default gen_random_uuid(),
  user_tg_id bigint not null references public.users(tg_id) on delete cascade,
  network text not null check (network in ('adsgram','monetag','richads')),
  day date not null default (now() at time zone 'utc')::date,
  reward_cloud integer not null default 0,
  clicked boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_ad_views_user_day on public.ad_views(user_tg_id, day);
create index if not exists idx_ad_views_user_network_day on public.ad_views(user_tg_id, network, day);

grant select, insert on public.ad_views to authenticated;
grant all on public.ad_views to service_role;
alter table public.ad_views enable row level security;
drop policy if exists "ad_views self" on public.ad_views;
create policy "ad_views self" on public.ad_views for select to authenticated
  using (user_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));
drop policy if exists "ad_views insert self" on public.ad_views;
create policy "ad_views insert self" on public.ad_views for insert to authenticated
  with check (user_tg_id = public.current_tg_id());

-- ===== game_attempts (XOX daily limit) =====
create table if not exists public.game_attempts (
  id uuid primary key default gen_random_uuid(),
  user_tg_id bigint not null references public.users(tg_id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  result text not null check (result in ('started','win','lose','draw')),
  reward_cloud bigint not null default 0,
  ad_watched boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_game_attempts_user_day on public.game_attempts(user_tg_id, day);

grant select, insert, update on public.game_attempts to authenticated;
grant all on public.game_attempts to service_role;
alter table public.game_attempts enable row level security;
drop policy if exists "ga self" on public.game_attempts;
create policy "ga self" on public.game_attempts for select to authenticated
  using (user_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));
drop policy if exists "ga self insert" on public.game_attempts;
create policy "ga self insert" on public.game_attempts for insert to authenticated
  with check (user_tg_id = public.current_tg_id());

-- ===== referrals (per-referee progress) =====
create table if not exists public.referrals (
  referee_tg_id bigint primary key references public.users(tg_id) on delete cascade,
  referrer_tg_id bigint not null references public.users(tg_id) on delete cascade,
  ads_completed integer not null default 0,
  bonus_unlocked boolean not null default false,
  commission_total_cloud bigint not null default 0,
  is_eligible boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_referrals_referrer on public.referrals(referrer_tg_id);

grant select, insert, update on public.referrals to authenticated;
grant all on public.referrals to service_role;
alter table public.referrals enable row level security;
drop policy if exists "ref self" on public.referrals;
create policy "ref self" on public.referrals for select to authenticated
  using (referee_tg_id = public.current_tg_id() or referrer_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));

-- ===== app_config =====
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
grant select on public.app_config to authenticated;
grant all on public.app_config to service_role;
alter table public.app_config enable row level security;
drop policy if exists "app_config read" on public.app_config;
create policy "app_config read" on public.app_config for select to authenticated using (true);

insert into public.app_config(key, value) values
  ('ref_min_account_age_days', '30'::jsonb),
  ('min_withdraw_ton', '1.0'::jsonb),
  ('min_withdraw_binance', '1.0'::jsonb),
  ('fee_ton_pct', '5'::jsonb),
  ('fee_binance_pct', '1'::jsonb),
  ('daily_reward_cloud', '80'::jsonb)
on conflict (key) do nothing;

-- ===== announcements: add custom-mode columns =====
alter table public.announcements add column if not exists mode text not null default 'copy' check (mode in ('copy','custom'));
alter table public.announcements add column if not exists text text;
alter table public.announcements add column if not exists photo_url text;
alter table public.announcements add column if not exists buttons jsonb;
-- source_chat_id / source_message_id become nullable for custom mode
alter table public.announcements alter column source_chat_id drop not null;
alter table public.announcements alter column source_message_id drop not null;

-- ===== RPC: increment referral commission counter =====
create or replace function public.inc_referral_commission(_referee bigint, _amount bigint)
returns void language sql security definer set search_path = public as $$
  update public.referrals set commission_total_cloud = commission_total_cloud + _amount
    where referee_tg_id = _referee;
$$;
grant execute on function public.inc_referral_commission(bigint, bigint) to authenticated, service_role;

-- ===== RPC: lock-next ton payout (single-row queue) =====
create or replace function public.ton_lock_next_payout()
returns setof public.withdrawals language plpgsql security definer set search_path = public as $$
declare picked_id uuid;
begin
  -- Pick the oldest 'queued' TON withdrawal, lock and flip to 'processing'.
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

-- ===== Optional schedule for the worker (uncomment if pg_cron enabled) =====
-- create extension if not exists pg_cron;
-- select cron.schedule('cloudearn_ton_worker', '*/5 * * * * *',
--   $$ select net.http_post(
--        url:='https://<PROJECT-REF>.functions.supabase.co/ton-payouts',
--        headers:='{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb
--      ); $$);

-- =====================================================
-- DONE.
-- =====================================================
