-- Cloud Market overhaul: gift flag, refund audit, backfill Tiny gift, dedupe with prorated refunds.

-- A) Gift flag
ALTER TABLE public.user_clouds
  ADD COLUMN IF NOT EXISTS is_gift boolean NOT NULL DEFAULT false;

-- B) Refund audit log
CREATE TABLE IF NOT EXISTS public.market_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_tg_id bigint NOT NULL,
  product_id text NOT NULL,
  cloud_id uuid,
  purchased_at timestamptz NOT NULL,
  refund_amount integer NOT NULL,
  reason text NOT NULL DEFAULT 'duplicate_cleanup',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.market_refunds TO authenticated;
GRANT ALL ON public.market_refunds TO service_role;
ALTER TABLE public.market_refunds ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "own refunds readable" ON public.market_refunds
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- C) Backfill: every user gets a 90-day Tiny Cloud gift (if none active yet)
INSERT INTO public.user_clouds (user_tg_id, product_id, purchased_at, last_claim_at, ads_progress, expires_at, is_gift)
SELECT u.tg_id, 'tiny', now(), now(), 0, now() + interval '90 days', true
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_clouds c
  WHERE c.user_tg_id = u.tg_id AND c.product_id = 'tiny'
    AND c.expires_at > now()
);

-- D) Duplicate cleanup + prorated refund (non-gift only)
WITH costs(product_id, cost) AS (
  VALUES ('tiny', 8000), ('river', 11000), ('gold', 14000),
         ('royal', 16500), ('commit', 18500)
),
ranked AS (
  SELECT c.*,
    ROW_NUMBER() OVER (PARTITION BY user_tg_id, product_id
                       ORDER BY expires_at DESC, purchased_at DESC) AS rn
  FROM public.user_clouds c
  WHERE COALESCE(is_gift,false) = false
),
dupes AS (
  SELECT r.id, r.user_tg_id, r.product_id, r.purchased_at, k.cost,
    GREATEST(0, 30 - LEAST(30, FLOOR(EXTRACT(EPOCH FROM (now() - r.purchased_at))/86400)::int)) AS days_left
  FROM ranked r
  JOIN costs k USING (product_id)
  WHERE r.rn > 1 AND r.expires_at > now()
),
inserted AS (
  INSERT INTO public.market_refunds (user_tg_id, product_id, cloud_id, purchased_at, refund_amount)
  SELECT user_tg_id, product_id, id, purchased_at,
         ROUND(cost * days_left / 30.0)::int
  FROM dupes
  RETURNING user_tg_id, refund_amount
),
totals AS (
  SELECT user_tg_id, SUM(refund_amount)::int AS total FROM inserted GROUP BY user_tg_id
)
UPDATE public.users u
SET balance_cloud = balance_cloud + t.total
FROM totals t
WHERE u.tg_id = t.user_tg_id;

-- Remove duplicate rows (keep row with latest expires_at per user_tg_id+product_id)
DELETE FROM public.user_clouds c
USING (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_tg_id, product_id
                                  ORDER BY expires_at DESC, purchased_at DESC) rn
    FROM public.user_clouds WHERE COALESCE(is_gift,false) = false
  ) x WHERE rn > 1
) d
WHERE c.id = d.id;
