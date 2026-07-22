-- ============================================================================
-- CloudEarn — 2026-06-25 migration
-- Safe to run multiple times. Adds:
--   • device fingerprint anti-multi-account + admin whitelist
--   • proxycheck IP/VPN columns on users
--   • banner system (banners + dismissals)
--   • new ad networks (onclicka, gigapup)
--   • announcements columns for custom/copy mode
-- ============================================================================

-- ------------------------------------------------------------------
-- USERS: add VPN/risk + faucetpay/bio columns if not already present
-- ------------------------------------------------------------------
alter table public.users add column if not exists country_code text;
alter table public.users add column if not exists country_name text;
alter table public.users add column if not exists is_vpn boolean not null default false;
alter table public.users add column if not exists risk_score integer;
alter table public.users add column if not exists faucetpay_address text;
alter table public.users add column if not exists bio_verified boolean not null default false;

-- ------------------------------------------------------------------
-- DEVICE FINGERPRINT (anti multi-account)
-- ------------------------------------------------------------------
create table if not exists public.device_fingerprints (
  id          uuid primary key default gen_random_uuid(),
  tg_id       bigint not null,
  fp_hash     text   not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  unique (fp_hash, tg_id)
);
create index if not exists idx_fp_hash on public.device_fingerprints(fp_hash);
create index if not exists idx_fp_tg   on public.device_fingerprints(tg_id);

grant select on public.device_fingerprints to authenticated;
grant all    on public.device_fingerprints to service_role;
alter table public.device_fingerprints enable row level security;
drop policy if exists "fp service" on public.device_fingerprints;
create policy "fp service" on public.device_fingerprints for all to service_role using (true) with check (true);

-- ------------------------------------------------------------------
-- AUTH WHITELIST (bypass fingerprint duplicate check)
-- ------------------------------------------------------------------
create table if not exists public.auth_whitelist (
  tg_id      bigint primary key,
  note       text,
  created_at timestamptz not null default now(),
  created_by bigint
);
grant select on public.auth_whitelist to authenticated;
grant all    on public.auth_whitelist to service_role;
alter table public.auth_whitelist enable row level security;
drop policy if exists "wl admin" on public.auth_whitelist;
create policy "wl admin" on public.auth_whitelist for all to authenticated
  using (public.is_admin(public.current_tg_id()))
  with check (public.is_admin(public.current_tg_id()));

-- ------------------------------------------------------------------
-- BANNERS (home-page promo banners) + per-user dismissal state
-- ------------------------------------------------------------------
create table if not exists public.banners (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text not null,
  link         text,
  target_views integer,                   -- null = unlimited
  views_count  integer not null default 0,
  is_active    boolean not null default true,
  created_by   bigint,
  created_at   timestamptz not null default now()
);
create index if not exists idx_banners_active on public.banners(is_active, created_at desc);

create table if not exists public.banner_dismissals (
  tg_id        bigint  not null,
  banner_id    uuid    not null references public.banners(id) on delete cascade,
  last_seen_at timestamptz,         -- last time a "view" was actually counted
  dismissed_at timestamptz,         -- time user pressed × (24h hide window resets every dismiss)
  primary key (tg_id, banner_id)
);

grant select on public.banners to authenticated;
grant all    on public.banners to service_role;
grant select on public.banner_dismissals to authenticated;
grant all    on public.banner_dismissals to service_role;

alter table public.banners enable row level security;
alter table public.banner_dismissals enable row level security;
drop policy if exists "banner read all" on public.banners;
create policy "banner read all" on public.banners for select to authenticated using (true);
drop policy if exists "banner admin"   on public.banners;
create policy "banner admin"   on public.banners for all to authenticated
  using (public.is_admin(public.current_tg_id()))
  with check (public.is_admin(public.current_tg_id()));
drop policy if exists "bd self" on public.banner_dismissals;
create policy "bd self" on public.banner_dismissals for select to authenticated
  using (tg_id = public.current_tg_id() or public.is_admin(public.current_tg_id()));

-- ------------------------------------------------------------------
-- ANNOUNCEMENTS: add custom/copy columns (loose types, allow nulls)
-- ------------------------------------------------------------------
alter table public.announcements add column if not exists mode text not null default 'copy';
alter table public.announcements add column if not exists text text;
alter table public.announcements add column if not exists photo_url text;
alter table public.announcements add column if not exists buttons jsonb;
-- Allow either a numeric id or @username for the source chat.
alter table public.announcements alter column source_chat_id drop not null;
alter table public.announcements alter column source_message_id drop not null;
alter table public.announcements add column if not exists source_chat_text text;

-- ------------------------------------------------------------------
-- AD_VIEWS: include onclicka + gigapup networks
-- ------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'ad_views_network_check') then
    alter table public.ad_views drop constraint ad_views_network_check;
  end if;
exception when others then null; end $$;
alter table public.ad_views
  add constraint ad_views_network_check
  check (network in ('adsgram','monetag','richads','onclicka','gigapup'));

-- Done.