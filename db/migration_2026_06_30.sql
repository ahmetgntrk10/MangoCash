-- =====================================================================
-- CloudEarn migration 2026-06-30
-- Run in Supabase SQL Editor.
--
-- Changes:
--   • Drop the XOX game tables entirely (feature retired).
--   • Add public.user_clouds  — Cloud Market inventory (30-day life per row).
--   • Bump legacy referrals rows out of "pending" so referral counts unfreeze.
--   • Ensure users.status supports 'banned' (already in schema, no-op if so).
-- =====================================================================

-- ── XOX cleanup ───────────────────────────────────────────────────────
drop table if exists public.xox_sessions        cascade;
drop table if exists public.xox_daily_attempts  cascade;
drop table if exists public.game_attempts       cascade;
-- game_results is a legacy shell table; safe to drop.
drop table if exists public.game_results        cascade;

-- ── Cloud Market inventory ────────────────────────────────────────────
create table if not exists public.user_clouds (
  id             uuid primary key default gen_random_uuid(),
  user_tg_id     bigint not null references public.users(tg_id) on delete cascade,
  product_id     text not null,
  purchased_at   timestamptz not null default now(),
  last_claim_at  timestamptz not null default now(),
  ads_progress   integer not null default 0,
  total_claimed  bigint not null default 0,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_user_clouds_user     on public.user_clouds(user_tg_id);
create index if not exists idx_user_clouds_expires  on public.user_clouds(expires_at);

-- Data API grants (edge function uses service_role but keep parity).
grant select, insert, update, delete on public.user_clouds to authenticated;
grant all on public.user_clouds to service_role;

alter table public.user_clouds enable row level security;

drop policy if exists "uc self read"   on public.user_clouds;
create policy "uc self read"   on public.user_clouds for select to authenticated
  using (user_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));
drop policy if exists "uc self insert" on public.user_clouds;
create policy "uc self insert" on public.user_clouds for insert to authenticated
  with check (user_tg_id = public.current_tg_id());
drop policy if exists "uc self update" on public.user_clouds;
create policy "uc self update" on public.user_clouds for update to authenticated
  using (user_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()))
  with check (user_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));
drop policy if exists "uc self delete" on public.user_clouds;
create policy "uc self delete" on public.user_clouds for delete to authenticated
  using (user_tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));

-- ── Unfreeze legacy "pending" referrals ───────────────────────────────
-- The new commission-only model expects every eligible invite to count in
-- users.referral_count immediately, without waiting for a mining claim.
-- We treat any existing eligible referral row as fully activated and
-- rebuild users.referral_count from the referrals table.
update public.referrals
   set signup_reward_paid_at = coalesce(signup_reward_paid_at, now()),
       mining_claimed_at     = coalesce(mining_claimed_at,     now()),
       bonus_unlocked        = true
 where is_eligible = true;

with counts as (
  select referrer_tg_id, count(*)::int as c
    from public.referrals
   where is_eligible = true
   group by referrer_tg_id
)
update public.users u
   set referral_count = counts.c
  from counts
 where u.tg_id = counts.referrer_tg_id
   and u.referral_count < counts.c;

-- Bans: users.status already allows 'banned' in the base schema — nothing to do.