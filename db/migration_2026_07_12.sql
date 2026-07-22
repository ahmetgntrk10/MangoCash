-- 2026-07-12 — Gate referrals behind first mining claim; broaden duplicate
-- device / IP detection. Backfills existing pending referrals and rebuilds
-- users.referral_count from the eligible subset.

-- 1) Ensure the columns we rely on exist.
alter table public.referrals
  add column if not exists mining_claimed_at timestamptz,
  add column if not exists account_age_ok boolean not null default true,
  add column if not exists is_premium boolean not null default false,
  add column if not exists is_eligible boolean not null default false;

-- 2) Any referral row that was previously marked eligible without a real
--    first-mining-claim record should be considered pending again.
update public.referrals r
   set is_eligible = false,
       bonus_unlocked = false,
       mining_claimed_at = null
  from public.users u
 where u.tg_id = r.referee_tg_id
   and r.is_eligible = true
   and not exists (
     select 1 from public.mining_claims mc where mc.user_tg_id = u.tg_id
   );

-- 3) Promote every referee that already claimed mining at least once.
update public.referrals r
   set is_eligible = true,
       bonus_unlocked = true,
       mining_claimed_at = coalesce(r.mining_claimed_at, mc_first.first_claim)
  from (
    select user_tg_id, min(created_at) as first_claim
      from public.mining_claims
     group by user_tg_id
  ) mc_first
 where mc_first.user_tg_id = r.referee_tg_id
   and r.account_age_ok = true
   and coalesce(r.is_eligible, false) = false;

-- 4) Rebuild referral_count on users from the eligible referral rows.
update public.users u
   set referral_count = coalesce(sub.n, 0)
  from (
    select referrer_tg_id, count(*) as n
      from public.referrals
     where is_eligible = true
     group by referrer_tg_id
  ) sub
 where sub.referrer_tg_id = u.tg_id;

update public.users
   set referral_count = 0
 where referral_count > 0
   and tg_id not in (select referrer_tg_id from public.referrals where is_eligible = true);
