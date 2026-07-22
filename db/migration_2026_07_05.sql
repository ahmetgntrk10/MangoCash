-- CloudEarn migration — 2026-07-05
-- Adds the Cloud Tap-Tap daily-progress table used by
-- the `taptap_status`, `taptap_tap`, and `taptap_unlock` edge-function actions.
--
-- No changes to `withdrawals` are required — FaucetPay bulk/single-pay
-- logic (auto-reject on invalid FP account, keep pending on insufficient
-- funds, refund + DM on reject) runs entirely inside the edge functions
-- against the existing schema.

CREATE TABLE IF NOT EXISTS public.taptap_daily (
  user_tg_id   BIGINT       NOT NULL,
  day          DATE         NOT NULL,
  earned       INTEGER      NOT NULL DEFAULT 0,
  ads_watched  INTEGER      NOT NULL DEFAULT 0,
  locked       BOOLEAN      NOT NULL DEFAULT false,
  last_tap_at  TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_tg_id, day),
  CONSTRAINT taptap_earned_nonneg CHECK (earned >= 0),
  CONSTRAINT taptap_earned_max    CHECK (earned <= 1000),
  CONSTRAINT taptap_ads_nonneg    CHECK (ads_watched >= 0)
);

CREATE INDEX IF NOT EXISTS taptap_daily_day_idx ON public.taptap_daily(day);

-- Only the edge function (service_role) reads/writes this table.
GRANT ALL ON public.taptap_daily TO service_role;

ALTER TABLE public.taptap_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "taptap_service_all" ON public.taptap_daily;
CREATE POLICY "taptap_service_all"
  ON public.taptap_daily
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);