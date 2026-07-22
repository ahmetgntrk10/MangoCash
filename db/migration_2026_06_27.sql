-- CloudEarn migration 2026-06-27
-- Run in Supabase SQL Editor.

-- 1) New user columns ─ bio reward + proxycheck cache.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio_reward_claimed boolean NOT NULL DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS proxycheck_checked_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS proxycheck_ip text;

-- 2) Mining sessions — one open session per user, claimed flips at the end.
CREATE TABLE IF NOT EXISTS public.mining_sessions (
  user_tg_id  bigint PRIMARY KEY REFERENCES public.users(tg_id) ON DELETE CASCADE,
  started_at  timestamptz NOT NULL,
  expires_at  timestamptz NOT NULL,
  hours_total int NOT NULL DEFAULT 1,
  claimed     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mining_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mining_sessions_service ON public.mining_sessions;
CREATE POLICY mining_sessions_service ON public.mining_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) Mining boost whitelist (admin-controlled) — entitled users can extend
-- their session by +1h per Adsgram rewarded ad up to MINING_MAX_HOURS (6).
CREATE TABLE IF NOT EXISTS public.mining_boost_users (
  tg_id      bigint PRIMARY KEY,
  note       text,
  created_by bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mining_boost_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mining_boost_service ON public.mining_boost_users;
CREATE POLICY mining_boost_service ON public.mining_boost_users
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4) Allow new ad_ticket purposes (no schema change — purpose is free text,
-- the API whitelists 'mining_claim' and 'mining_extend').