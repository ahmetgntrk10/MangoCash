-- CloudEarn — 2026-07-08 Toncoin withdrawal support
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ton_address text;

ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS tx_id text;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS admin_note text;

DO $$ BEGIN
  ALTER TYPE public.withdraw_method ADD VALUE IF NOT EXISTS 'toncoin';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS unchanged: withdrawals are read/written via SECURITY DEFINER edge functions.
-- users.ton_address is set only through the update_profile action.