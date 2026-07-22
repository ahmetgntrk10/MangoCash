-- CloudEarn — 2026-07-07 FaucetPay withdrawal repair
-- Run in your own Supabase SQL Editor after deploying the updated Edge Functions.

ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS fee_usdt numeric(18,8) NOT NULL DEFAULT 0;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS amount_net_usdt numeric(18,8);
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS batch_id uuid;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS queued_at timestamptz;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS tx_id text;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS processed_at timestamptz;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS processed_by bigint;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS last_error text;

CREATE INDEX IF NOT EXISTS idx_wd_batch ON public.withdrawals(batch_id);
CREATE INDEX IF NOT EXISTS idx_wd_status_method ON public.withdrawals(status, method);

DO $$ BEGIN ALTER TYPE public.withdraw_method ADD VALUE IF NOT EXISTS 'faucetpay'; EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.withdraw_status ADD VALUE IF NOT EXISTS 'queued'; EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.withdraw_status ADD VALUE IF NOT EXISTS 'processing'; EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.withdraw_status ADD VALUE IF NOT EXISTS 'paid'; EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE public.withdraw_status ADD VALUE IF NOT EXISTS 'failed'; EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.withdrawals DROP CONSTRAINT IF EXISTS withdrawals_status_check;
  ALTER TABLE public.withdrawals
    ADD CONSTRAINT withdrawals_status_check
    CHECK (status::text IN ('pending','queued','processing','approved','paid','rejected','failed'));
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.faucetpay_lock_next_payout(_batch_id uuid DEFAULT NULL)
RETURNS SETOF public.withdrawals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE picked_id uuid;
BEGIN
  SELECT id INTO picked_id
    FROM public.withdrawals
   WHERE method::text = 'faucetpay'
     AND status::text IN ('queued','approved')
     AND (_batch_id IS NULL OR batch_id = _batch_id)
   ORDER BY queued_at ASC NULLS LAST, created_at ASC
   FOR UPDATE SKIP LOCKED
   LIMIT 1;
  IF picked_id IS NULL THEN RETURN; END IF;
  UPDATE public.withdrawals SET status = 'processing'::public.withdraw_status WHERE id = picked_id;
  RETURN QUERY SELECT * FROM public.withdrawals WHERE id = picked_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.faucetpay_lock_next_payout(uuid) TO service_role;

WITH stuck AS (
  SELECT id, user_tg_id, amount_usdt
    FROM public.withdrawals
   WHERE method::text = 'faucetpay'
     AND status::text IN ('pending','queued','processing')
     AND COALESCE(last_error, '') ILIKE 'transient:%'
     AND (
       last_error ILIKE '%does not belong%'
       OR last_error ILIKE '%not associated%'
       OR last_error ILIKE '%not registered%'
       OR last_error ILIKE '%no account%'
       OR last_error ILIKE '%not verified%'
       OR last_error ILIKE '%unverified%'
       OR last_error ILIKE '%invalid address%'
     )
), moved AS (
  UPDATE public.withdrawals w
     SET status = 'rejected'::public.withdraw_status,
         processed_at = now(),
         batch_id = NULL,
         queued_at = NULL,
         last_error = regexp_replace(COALESCE(w.last_error, 'FaucetPay email is not registered or not verified'), '^transient:', '')
    FROM stuck s
   WHERE w.id = s.id
   RETURNING s.user_tg_id, s.amount_usdt
)
UPDATE public.users u
   SET balance_usdt = u.balance_usdt + m.amount_usdt
  FROM moved m
 WHERE u.tg_id = m.user_tg_id;