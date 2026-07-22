-- CloudEarn migration 2026-06-29
-- Promo Code conditions + per-day mining claim log + Telegram membership cache.
-- Run in Supabase SQL Editor. Idempotent.

-- ─── Promo Code conditions ─────────────────────────────────────────────
ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS conditions jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ─── Mining claim history (for "today's claims" conditions) ─────────────
CREATE TABLE IF NOT EXISTS public.mining_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_tg_id bigint NOT NULL,
  reward_cloud integer NOT NULL,
  hours_total integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mining_claims TO authenticated;
GRANT ALL ON public.mining_claims TO service_role;
ALTER TABLE public.mining_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_mining_claims" ON public.mining_claims;
CREATE POLICY "own_mining_claims" ON public.mining_claims
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS mining_claims_tg_day_idx
  ON public.mining_claims (user_tg_id, created_at DESC);

-- ─── ad_views index for "today" counts per network ─────────────────────
CREATE INDEX IF NOT EXISTS ad_views_tg_network_day_idx
  ON public.ad_views (user_tg_id, network, day);

-- ─── Telegram chat membership cache (promo channel_member condition) ───
CREATE TABLE IF NOT EXISTS public.tg_member_cache (
  tg_id bigint NOT NULL,
  chat_ref text NOT NULL,
  is_member boolean NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tg_id, chat_ref)
);
GRANT ALL ON public.tg_member_cache TO service_role;
ALTER TABLE public.tg_member_cache ENABLE ROW LEVEL SECURITY;

-- ─── Referral integrity guard index ────────────────────────────────────
CREATE INDEX IF NOT EXISTS referrals_mining_claimed_idx
  ON public.referrals (referrer_tg_id, mining_claimed_at);