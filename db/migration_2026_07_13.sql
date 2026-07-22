-- =====================================================
-- CloudEarn migration — 2026-07-13
-- Fix: total_earned_cloud was being double-counted because of an AFTER
-- UPDATE trigger (`trg_bump_total_earned`) that also incremented
-- total_earned_cloud every time balance_cloud went up — even when the
-- calling code had already updated total_earned_cloud in the same
-- statement, and even for refunds / commissions that must not count as
-- new "earnings". This migration removes the trigger and backfills the
-- inflated totals. Idempotent; safe to re-run.
-- =====================================================

-- 1) Drop the doubling trigger and its function.
drop trigger  if exists trg_bump_total_earned on public.users;
drop function if exists public.bump_total_earned();

-- 2) Backfill: historical total_earned_cloud has been ~2x the real value
--    because the trigger fired on every balance_cloud increment. We halve
--    it, but never allow it to drop below the current balance so a user
--    who never spent anything keeps a consistent number.
update public.users
   set total_earned_cloud = greatest(
         coalesce(balance_cloud, 0),
         floor(coalesce(total_earned_cloud, 0) / 2)
       )
 where coalesce(total_earned_cloud, 0) > coalesce(balance_cloud, 0);
