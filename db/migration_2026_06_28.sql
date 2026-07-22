-- CloudEarn migration 2026-06-28
-- Run in Supabase SQL Editor.
--
-- Adds:
--   • tasks.payout_usdt           — per-completion user payout (45% of budget)
--   • tasks.platform_fee_usdt     — 55% platform cut
--   • users.is_premium            — Telegram Premium flag (anti-bot signal)
--   • users.total_earned_usdt     — lifetime USDT credited to balance
--   • referrals.mining_claimed_at — set when invitee claims their first mining session
--   • referrals.signup_reward_paid_at — set when +200 ☁️ paid to referrer
--   • referrals.account_age_ok    — false if invitee account looks brand-new
--   • referrals.is_premium        — true if invitee has Telegram Premium

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS payout_usdt numeric(20,8);
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS platform_fee_usdt numeric(20,8);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_earned_usdt numeric(20,8) NOT NULL DEFAULT 0;

ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS mining_claimed_at timestamptz;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS signup_reward_paid_at timestamptz;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS account_age_ok boolean NOT NULL DEFAULT true;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false;

-- Useful index for "active today" stats.
CREATE INDEX IF NOT EXISTS users_last_active_idx ON public.users (last_active_at DESC);

-- Backfill: any pre-existing referrals are treated as already paid so we
-- never double-pay legacy invites once the new mining-gated flow goes live.
UPDATE public.referrals SET signup_reward_paid_at = now()
  WHERE signup_reward_paid_at IS NULL;