-- ============================================================
-- CloudEarn — 2026-07-06 migration
-- Backend ad-watch enforcement hardening.
-- Idempotent: safe to re-run.
-- ============================================================

-- 1) Widen ad_tickets.purpose to include every purpose the api function issues.
--    The original constraint from 2026-06-26 only listed early purposes; new ones
--    (mining_*, market_*, taptap) must be allowed at DB-level too.
do $$ begin
  alter table public.ad_tickets drop constraint if exists ad_tickets_purpose_check;
  alter table public.ad_tickets
    add constraint ad_tickets_purpose_check
    check (purpose in (
      'daily','withdraw','promo','task_ads',
      'mining_claim','mining_extend',
      'market_ad','market_claim',
      'taptap'
    ));
exception when others then null;
end $$;

-- 2) Helpful index for the new "1 active ticket per (user,purpose)" invalidation
--    query and for the 60-second rate-limit lookup.
create index if not exists idx_ad_tickets_active
  on public.ad_tickets(user_tg_id, purpose)
  where consumed_at is null;