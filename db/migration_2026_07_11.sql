-- CloudEarn migration 2026-07-11
-- Ensure every existing (and future) Tiny Cloud has 90 days remaining.
-- Purchased Tiny Clouds are NOT refunded and NOT deleted — only extended.
-- Idempotent: safe to re-run (will just re-extend to 90 days from now).

UPDATE public.user_clouds
SET expires_at = now() + interval '90 days'
WHERE product_id = 'tiny'
  AND expires_at > now();