-- CloudEarn migration 2026-07-10
-- Add 'towerads' to allowed ad_views.network values.
-- Idempotent: safe to re-run.

ALTER TABLE public.ad_views
  DROP CONSTRAINT IF EXISTS ad_views_network_check;

ALTER TABLE public.ad_views
  ADD CONSTRAINT ad_views_network_check
  CHECK (network IN ('adsgram', 'monetag', 'richads', 'onclicka', 'gigapup', 'towerads'));