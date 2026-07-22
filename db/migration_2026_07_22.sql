-- =====================================================
-- CloudEarn — 2026-07-22
-- Fixes user_devices index, ensures grants, backfills.
-- Safe to re-run.
-- =====================================================

-- 1. Drop the broken expression-based unique index (coalesce(host(ip),''))
-- that prevented upserts from succeeding. We now do check-then-insert in code.
drop index if exists public.user_devices_uq;

-- 2. Guarantee grants on device / suspect tables (service_role only).
grant select, insert, update, delete on public.user_devices      to service_role;
grant select, insert, update, delete on public.duplicate_suspects to service_role;

-- 3. Ensure market / notify columns exist (idempotent).
alter table public.users
  add column if not exists notify_market boolean not null default false;
alter table public.user_clouds
  add column if not exists daily_claims jsonb not null default '{}'::jsonb;
alter table public.user_clouds
  add column if not exists last_notified_at timestamptz;

-- 4. Exclusive tasks: make sure USDT columns exist for admin-created rows.
alter table public.tasks
  add column if not exists reward_usdt numeric(18,6) not null default 0;
alter table public.tasks
  add column if not exists payout_usdt numeric(18,6) not null default 0;
alter table public.tasks
  add column if not exists is_exclusive boolean not null default false;

-- 5. Backfill referral_count so it matches the new "count on signup" rule
-- (every non-blocked referred user counts, no mining gate).
update public.referrals
   set is_eligible = true, bonus_unlocked = true
 where is_eligible = false;

update public.users u
   set referral_count = sub.c
  from (
    select referrer_tg_id, count(*)::int as c
      from public.referrals
     where is_eligible = true
     group by referrer_tg_id
  ) sub
 where u.tg_id = sub.referrer_tg_id;

-- 6. Withdrawals: nothing schema-wise; admin panel now reads
-- users.balance_cloud / balance_usdt via the existing join.